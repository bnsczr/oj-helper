const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {handle}=require('./native-host');const {readPreferences,defaultFor}=require('./preferences');
const {autoOpenSummary}=require('./extension/open-settings');
const samples=[{input:'1',output:'2'},{input:'3',output:'4'}];
async function fixture(run){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-auto-open-')),secretFile=path.join(directory,'secret'),stateFile=path.join(directory,'prefs.json');
 try{
  await fs.writeFile(secretFile,'paired');const opened=[];
  const options={secretFile,stateFile,openEditor:async files=>{
   for(const file of files)assert.equal((await fs.stat(file)).isFile(),true);
   opened.push([...files]);
  }};
  const base={secret:'paired',directory,initialContent:'// initial',openAfterAdd:{}};
  const problem={...base,action:'create',url:'https://codeforces.com/contest/2278/problem/D',samples,statement:'# D. Single\n\nSample 1 2 3 4\n'};
  const dashboard={...base,action:'create-dashboard',url:'https://codeforces.com/contest/2278',problems:['A','B1','F'].map(index=>({index,samples,statement:'# '+index+'. Problem\n\nAll samples 1 2 3 4\n'}))};
  await run({directory,stateFile,options,opened,problem,dashboard});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
}
test('Dashboard 默认覆盖整场 statement 并一次打开全部 C++ 文件和题面',async()=>fixture(async({directory,stateFile,options,opened,dashboard})=>{
 await fs.writeFile(path.join(directory,'statement.md'),'old statement');
 const result=await handle(dashboard,options);assert.equal(result.error,undefined);assert.equal(result.warnings,undefined);
 assert.deepEqual(opened,[['A.cpp','B1.cpp','F.cpp','statement.md'].map(name=>path.join(directory,name))]);
 assert.deepEqual(result.openedFiles,opened[0]);const content=await fs.readFile(result.statementPath,'utf8');
 for(const index of ['A','B1','F']){assert.match(content,new RegExp('# '+index+'\\. Problem'));assert.equal(defaultFor(path.join(directory,index+'.cpp'),readPreferences(stateFile)),'2278'+index);}
 assert.equal(content.split('All samples').length-1,3);assert.doesNotMatch(content,/old statement/);
 assert.match(autoOpenSummary(result),/statement\.md/);
}));
test('单题默认只打开该题 C++，不创建或覆盖 statement',async()=>fixture(async({directory,options,opened,problem})=>{
 const statement=path.join(directory,'statement.md');
 const result=await handle(problem,options);assert.equal(result.error,undefined);assert.deepEqual(opened,[[path.join(directory,'A.cpp')]]);await assert.rejects(fs.stat(statement),{code:'ENOENT'});
 await fs.writeFile(statement,'previous contest');
 await handle(problem,options);assert.equal(await fs.readFile(statement,'utf8'),'previous contest');
}));
test('两类页面各自的 C++ 和题面开关独立，关闭打开不影响 C++ 创建与题号保存',async()=>{
 for(const dashboardPage of [true,false])for(const cpp of [true,false])for(const statement of [true,false]){
  await fixture(async({directory,stateFile,options,opened,problem,dashboard})=>{
   const settings=dashboardPage?{dashboardCpp:cpp,dashboardStatement:statement,problemCpp:!cpp,problemStatement:!statement}:{dashboardCpp:!cpp,dashboardStatement:!statement,problemCpp:cpp,problemStatement:statement};
   const result=await handle({...dashboardPage?dashboard:problem,openAfterAdd:settings},options);assert.equal(result.error,undefined);assert.equal(result.warnings,undefined);
   const cppNames=dashboardPage?['A.cpp','B1.cpp','F.cpp']:['A.cpp'];
   for(const name of cppNames)assert.match(await fs.readFile(path.join(directory,name),'utf8'),/initial/);
   const expected=[...(cpp?cppNames:[]),...(statement?['statement.md']:[])].map(name=>path.join(directory,name));
   assert.deepEqual(opened,expected.length?[expected]:[]);
   if(statement)assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),dashboardPage?/# A\. Problem/:/# D\. Single/);
   else await assert.rejects(fs.stat(path.join(directory,'statement.md')),{code:'ENOENT'});
   assert.equal(readPreferences(stateFile).lastAddition.kind,dashboardPage?'contest':'problem');
  });
 }
});
test('自动打开失败时回报警告但保留新建文件、题面和提交映射',async()=>fixture(async({directory,stateFile,options,dashboard})=>{
 const result=await handle(dashboard,{...options,openEditor:async()=>{throw Error('VS Code unavailable');}});
 assert.equal(result.error,undefined);assert.equal(result.openedFiles,undefined);assert.match(result.warnings[0],/自动打开失败.*VS Code unavailable/);
 assert.match(autoOpenSummary(result),/自动打开失败/);
 assert.equal(defaultFor(path.join(directory,'B1.cpp'),readPreferences(stateFile)),'2278B1');assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),/# B1\. Problem/);
}));
test('statement 目标异常时保留创建结果并仍打开选中的 C++，认证失败则不打开',async()=>fixture(async({directory,options,opened,dashboard})=>{
 assert.match((await handle({...dashboard,secret:'bad'},options)).error,/配对码/);assert.deepEqual(opened,[]);
 await fs.mkdir(path.join(directory,'statement.md'));const result=await handle(dashboard,options);
 assert.equal(result.error,undefined);assert.match(result.warnings[0],/题面自动保存失败/);assert.equal(opened[0].length,3);assert.equal(result.statementPath,undefined);
}));
