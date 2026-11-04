const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm'),fs=require('node:fs/promises'),sync=require('node:fs'),os=require('node:os'),path=require('node:path');
const {dashboardFromUrl}=require('./extension/problem');const {createContestFiles,createProblemFile}=require('./files-server');const {defaultFor,readPreferences,clearDefaults}=require('./preferences');const {appendSamples}=require('./samples');const {handle}=require('./native-host');
const script=sync.readFileSync(require.resolve('./extension/dashboard'),'utf8');
const samples=[{input:'1',output:'2'},{input:'3',output:'4'}];
test('Dashboard 识别并去重，只保留当前比赛的题号',()=>{
 const context=vm.createContext({URL,dashboardFromUrl});vm.runInContext(script,context);
 const links=['/contest/2278/problem/A','/contest/2278/problem/A','/contest/2278/problem/B1','/contest/1/problem/C','https://evil.test/contest/2278/problem/D'];
 const root={querySelectorAll:()=>links.map(href=>({getAttribute:()=>href}))};
 assert.equal(context.readDashboard(root,'https://codeforces.com/contest/2278').join(','),'A,B1');
 for(const url of ['https://codeforces.com/contest/2278/status','https://evil.test/contest/2278'])assert.equal(dashboardFromUrl(url),null);
});
test('所有题目页按标题匹配样例，顺序不混淆，缺题时报错',()=>{
 const nodes=['B1','A'].map(index=>({querySelector:()=>({textContent:index+'. Test'}),samples:[{input:index,output:index+' result'}]}));
 const context=vm.createContext({URL,location:{pathname:'/contest/2278/problems',href:'https://codeforces.com/contest/2278/problems'},document:{querySelectorAll:()=>nodes},readSamples:node=>node.samples,readStatement:(node,url)=>'# '+node.querySelector().textContent+'\n'+url});vm.runInContext(script,context);
 const result=context.readContestSamples(['A','B1']);assert.equal(result.problems[0].samples[0].input,'A');assert.equal(result.problems[1].samples[0].input,'B1');assert.match(result.problems[1].statement,/contest\/2278\/problem\/B1/);assert.throws(()=>context.readContestSamples(['A','C']),/缺少 C/);
});
test('批量创建覆盖 A、B1、F 并写入各自样例和文件题号，切换比赛后正确更新',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-dashboard-')),state=path.join(dir,'prefs.json');try{
 await fs.writeFile(path.join(dir,'A.cpp'),'old source');
 const problems=['A','B1','F'].map(index=>({index,samples:samples.map(sample=>({input:index+sample.input,output:sample.output}))}));
 const result=await createContestFiles(dir,'https://codeforces.com/contest/2278',problems,state,'// initial\n');assert.equal(result.files.length,3);
 for(const problem of problems){const target=path.join(dir,problem.index+'.cpp');assert.equal(defaultFor(target,readPreferences(state)),'2278'+problem.index);assert.equal(await fs.readFile(target,'utf8'),appendSamples('// initial\n',problem.samples));}
 await createContestFiles(dir,'https://codeforces.com/contest/1',problems,state,'// next\n');assert.equal(defaultFor(path.join(dir,'B1.cpp'),readPreferences(state)),'1B1');
 const single=await createProblemFile(dir,'https://codeforces.com/contest/1/problem/C',state,'// single',samples);assert.equal(single.name,'B.cpp');
 const next=await createProblemFile(dir,'https://codeforces.com/contest/1/problem/D',state,'// single',samples);assert.equal(next.name,'C.cpp');
 await clearDefaults(state);assert.equal(defaultFor(path.join(dir,'A.cpp'),readPreferences(state)),null);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('批量样例错误或目标是目录时，不先覆盖前面的文件',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-dashboard-invalid-')),state=path.join(dir,'prefs.json');try{
 await fs.writeFile(path.join(dir,'A.cpp'),'keep');
 await assert.rejects(createContestFiles(dir,'https://codeforces.com/contest/1',[{index:'A',samples},{index:'B',samples:[]}],state),/样例缺失/);assert.equal(await fs.readFile(path.join(dir,'A.cpp'),'utf8'),'keep');
 await fs.mkdir(path.join(dir,'B.cpp'));await assert.rejects(createContestFiles(dir,'https://codeforces.com/contest/1',[{index:'A',samples},{index:'B',samples}],state),/不是普通文件/);assert.equal(await fs.readFile(path.join(dir,'A.cpp'),'utf8'),'keep');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('浏览器批量流程只打开一个后台题目页，成功后关闭并发送全部题目',async()=>{
 const created=[],removed=[],native=[];const chrome={storage:{local:{get:async()=>({directory:'E:/code',bridgeSecret:'paired',initialContent:'// init',openAfterAdd:{dashboardCpp:false,dashboardStatement:true}})}},tabs:{create:async options=>{created.push(options);return {id:9};},get:async()=>({status:'complete'}),remove:async id=>removed.push(id)},scripting:{executeScript:async options=>options.files?[]:[{result:{problems:['A','B'].map(index=>({index,samples}))}}]},runtime:{sendNativeMessage:async(name,message)=>{native.push(message);return {files:message.problems.map(p=>({name:p.index+'.cpp'}))};}}};
 const context=vm.createContext({URL,dashboardFromUrl,chrome,setTimeout});vm.runInContext(script,context);
 const result=await context.createDashboardFiles(1,'https://codeforces.com/contest/2278',['A','B']);assert.equal(result.files.length,2);assert.equal(created.length,1);assert.equal(created[0].url,'https://codeforces.com/contest/2278/problems');assert.equal(created[0].active,false);assert.deepEqual(removed,[9]);assert.equal(native[0].action,'create-dashboard');assert.equal(native[0].problems.length,2);assert.equal(native[0].openAfterAdd.dashboardCpp,false);assert.equal(native[0].openAfterAdd.dashboardStatement,true);
});
test('本机批量入口认证并持久化实际题号',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-dashboard-native-')),stateFile=path.join(dir,'prefs.json'),secretFile=path.join(dir,'secret');try{
 await fs.writeFile(secretFile,'paired');const request={action:'create-dashboard',secret:'paired',directory:dir,url:'https://codeforces.com/contest/2278',initialContent:'// init',problems:[{index:'A',samples},{index:'C',samples}]};
 assert.match((await handle({...request,secret:'bad'},{stateFile,secretFile})).error,/配对码/);
 const result=await handle(request,{stateFile,secretFile});assert.equal(result.files.length,2);assert.equal(defaultFor(path.join(dir,'C.cpp'),readPreferences(stateFile)),'2278C');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
