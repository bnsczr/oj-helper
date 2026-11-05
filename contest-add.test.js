const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {handle}=require('./native-host');
const {defaultFor,readPreferences,selectVerdictMode,selectOj}=require('./preferences');
const samples=[{input:'1',output:'2'}];

async function fixture(run){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'oj-contest-add-')),secretFile=path.join(directory,'secret'),stateFile=path.join(directory,'preferences.json');
 const opened=[],options={secretFile,stateFile,openEditor:async files=>opened.push(files)};
 try{
  await fs.writeFile(secretFile,'paired');await selectVerdictMode('contest',stateFile);
  const add=async message=>{const result=await handle({directory,secret:'paired',initialContent:'// template',...message},options);assert.equal(result.error,undefined);return result;};
  await run({directory,stateFile,opened,add});
 }finally{for(const file of await fs.readdir(directory))await fs.unlink(path.join(directory,file));await fs.rmdir(directory);}
}

test('CF 单题按题号覆盖为零字节并更新提交映射，切回正常模式恢复模板和样例',()=>fixture(async({directory,stateFile,opened,add})=>{
 await selectOj('qoj',stateFile);
 const filename=path.join(directory,'B1.cpp');await fs.writeFile(filename,'previous source');await fs.writeFile(path.join(directory,'A.cpp'),'keep');
 const request={action:'create',url:'https://codeforces.com/contest/42/problem/B1',samples,statement:'# B1. Problem',openAfterAdd:{problemCpp:true,problemStatement:false}};
 const added=await add(request);assert.equal(added.name,'B1.cpp');assert.equal(added.emptySource,true);assert.equal(added.existed,true);assert.equal(added.sampleCount,0);
 assert.equal((await fs.stat(filename)).size,0);assert.equal(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),'keep');
 assert.equal(readPreferences(stateFile).activeOj,'cf');assert.equal(defaultFor(filename,readPreferences(stateFile)),'42B1');assert.deepEqual(opened,[[filename]]);
 await selectVerdictMode('normal',stateFile);await selectOj('qoj',stateFile);const normal=await add(request);assert.equal(normal.name,'B1.cpp');assert.equal(normal.emptySource,undefined);assert.equal(readPreferences(stateFile).activeOj,'cf');
 assert.match(await fs.readFile(filename,'utf8'),/\/\/ template[\s\S]*样例 1/);
}));

test('CF Dashboard 批量写入空白文件，缺少样例也能映射每题，题面仍可保存',()=>fixture(async({directory,stateFile,add})=>{
 await selectOj('qoj',stateFile);
 await fs.writeFile(path.join(directory,'A.cpp'),'previous source');
 const added=await add({action:'create-dashboard',url:'https://codeforces.com/contest/42',problems:[{index:'A',samples,statement:'# First problem'},{index:'B1',samples:null,statement:'# Second problem'}],openAfterAdd:{dashboardCpp:false,dashboardStatement:true}});
 assert.equal(added.emptySource,true);assert.equal(readPreferences(stateFile).activeOj,'cf');assert.deepEqual(added.files.map(file=>file.name),['A.cpp','B1.cpp']);
 for(const file of added.files){assert.equal((await fs.stat(file.path)).size,0);assert.equal(defaultFor(file.path,readPreferences(stateFile),'cf'),'42'+file.name.slice(0,-4));}
 assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),/First problem[\s\S]*Second problem/);
}));

test('QOJ 单题和 Dashboard 写入空白文件，保留比赛字母、题库数字和每个文件的提交映射',()=>fixture(async({directory,stateFile,add})=>{
 const a={url:'https://qoj.ac/contest/42/problem/123',title:'A. Example',statement:'# A. Example',samples};
 const b={url:'https://qoj.ac/contest/42/problem/124',title:'B1. Example',statement:'# B1. Example',samples};
 await fs.writeFile(path.join(directory,'B1.cpp'),'previous source');
 const single=await add({action:'qoj-create',problem:b});assert.equal(single.name,'B1.cpp');assert.equal(single.existed,true);assert.equal(single.emptySource,true);
 assert.equal((await fs.stat(single.path)).size,0);assert.equal(readPreferences(stateFile).activeOj,'qoj');assert.equal(defaultFor(single.path,readPreferences(stateFile)),b.url);
 const practice=await add({action:'qoj-create',problem:{...a,url:'https://qoj.ac/problem/125'}});assert.equal(practice.name,'125.cpp');assert.equal(defaultFor(practice.path,readPreferences(stateFile),'qoj'),'125');
 await selectOj('cf',stateFile);
 const dashboard=await add({action:'qoj-create-dashboard',url:'https://qoj.ac/contest/42',problems:[{...a,index:'A'},{...b,index:'B1'}],openAfterAdd:{dashboardCpp:false,dashboardStatement:true}});
 assert.equal(dashboard.emptySource,true);assert.equal(readPreferences(stateFile).activeOj,'qoj');assert.deepEqual(dashboard.files.map(file=>file.name),['A.cpp','B1.cpp']);
 for(const [index,file] of dashboard.files.entries()){assert.equal((await fs.stat(file.path)).size,0);assert.equal(defaultFor(file.path,readPreferences(stateFile),'qoj'),[a,b][index].url);}
 assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),/A\. Example[\s\S]*B1\. Example[\s\S]*导入样例/);
}));
