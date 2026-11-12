const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm'),fs=require('node:fs/promises'),sync=require('node:fs'),os=require('node:os'),path=require('node:path');
const {dashboardFromUrl}=require('./extension/problem');const {createContestFiles,createProblemFile}=require('./files-server');const {defaultFor,parseProblem,readPreferences,resetCliState}=require('./preferences');const {appendSamples}=require('./samples');const {handle}=require('./native-host');
const script=sync.readFileSync(require.resolve('./extension/dashboard'),'utf8');
const samples=[{input:'1',output:'2'},{input:'3',output:'4'}];
test('Dashboard 识别并去重，只保留当前比赛的题号',()=>{
 const context=vm.createContext({URL,dashboardFromUrl});vm.runInContext(script,context);
 const links=['/contest/2278/problem/A','/contest/2278/problem/A','/contest/2278/problem/B1','/contest/1/problem/C','https://evil.test/contest/2278/problem/D'];
 const root={querySelectorAll:()=>links.map(href=>({getAttribute:()=>href}))};
 assert.equal(context.readDashboard(root,'https://codeforces.com/contest/2278').join(','),'A,B1');
 for(const url of ['https://codeforces.com/contest/2278/status','https://evil.test/contest/2278'])assert.equal(dashboardFromUrl(url),null);
});
test('Codeforces Dashboard 识别当前 VP 倒计时，并跳过练习',()=>{
 const now=1780000000300;
 const {document}=require('linkedom').parseHTML('<div id="header"><a href="/profile/Tester">Tester</a></div><div id="sidebar"><span class="contest-state-phase">Contest is running</span><span class="contest-state-regular countdown">04:59:34</span><span class="contest-state-regular">Virtual Participation</span></div>');
 const context=vm.createContext({document,Date:{now:()=>now},decodeURIComponent});vm.runInContext(script,context);
 const clock=context.readCfContestClock();
 assert.equal(clock.virtual,true);assert.equal(clock.handle,'Tester');
 assert.equal(clock.endsAt,1780000000000+(5*3600-26)*1000);
 document.querySelector('.contest-state-phase').textContent='Finished';
 assert.equal(context.readCfContestClock(),null);
});
test('Codeforces 虚拟场按网页计时定位，翻页并排除练习、旧 VP 和其他账号',async()=>{
 const startedAt=1780000000000,durationSeconds=7200,calls=[];
 const run=(id,delta,participantType='VIRTUAL',start=startedAt,handle='Tester')=>({
  id,contestId:42,creationTimeSeconds:(startedAt+delta*1000)/1000,problem:{index:'A'},
  author:{participantType,startTimeSeconds:start/1000,members:[{handle}]},verdict:'WRONG_ANSWER',passedTestCount:2
 });
 const first=Array.from({length:1000},(_,i)=>run(1100-i,2000-i));
 first[0]=run(1100,2000,'PRACTICE');
 first[1]=run(1099,1999,'VIRTUAL',startedAt-3600000);
 first[2]=run(1098,1998,'VIRTUAL',startedAt,'Other');
 const second=[run(100,5),{...run(99,2),verdict:'OK',testset:'PRETESTS'},run(98,-50)];
 const context=vm.createContext({URL,URLSearchParams,AbortSignal,Date:{now:()=>startedAt+2000000},setTimeout:fn=>fn(),fetch:async value=>{
  const url=new URL(value);calls.push(url);
  const result=url.pathname.endsWith('contest.list')?[{id:42,durationSeconds}]:url.searchParams.get('from')==='1'?first:second;
  return {ok:true,json:async()=>({status:'OK',result})};
 }});
 vm.runInContext(script,context);
 const board=await context.readCfContestSubmissions({contest:'42',section:'gym',url:'https://codeforces.com/gym/42'},
  {virtual:true,handle:'Tester',endsAt:startedAt+durationSeconds*1000+2000},['A']);
 assert.equal(board.startedAt,startedAt);
 assert.equal(board.submissions.length,999);
 assert.equal(board.submissions.find(entry=>entry.id===99).state,'pending');
 assert.equal(board.submissions.find(entry=>entry.id===100).verdict,'Wrong answer on test 3');
 assert.equal(calls[2].searchParams.get('from'),'1001');
 assert.equal(calls[1].searchParams.get('handle'),'Tester');
});
test('所有题目页按标题匹配样例，并保留已读题供逐题补齐',()=>{
 const nodes=['B1','A'].map(index=>({querySelector:()=>({textContent:index+'. Test'}),samples:[{input:index,output:index+' result'}]}));
 const url='https://codeforces.com/gym/106725';
 const context=vm.createContext({URL,dashboardFromUrl,location:new URL(url+'/problems'),document:{querySelectorAll:()=>nodes},readSamples:node=>node.samples,readStatement:(node,url)=>'# '+node.querySelector().textContent+'\n'+url});vm.runInContext(script,context);
 const dashboard=dashboardFromUrl(url);
 const links=['/gym/106725/problem/A','/gym/106725/problem/B1','/contest/106725/problem/C'];
 assert.equal(context.readDashboard({querySelectorAll:()=>links.map(href=>({getAttribute:()=>href}))},url).join(','),'A,B1');
 const result=context.readContestSamples(['A','B1'],dashboard);
 assert.equal(result.problems[0].samples[0].input,'A');assert.equal(result.problems[1].samples[0].input,'B1');assert.match(result.problems[1].statement,/gym\/106725\/problem\/B1/);
 assert.equal(context.readContestSamples(['A','C'],dashboard).problems.length,1);
 context.location=new URL('https://codeforces.com/contest/106725/problems');
 assert.equal(context.readContestSamples(['A'],dashboard).waiting,true);
 context.location=new URL(url+'/problem/B1?locale=en');
 context.document={readyState:'interactive',querySelectorAll:()=>[nodes[0]]};
 assert.equal(context.readContestSamples(['B1'],dashboard,'B1').problems[0].samples[0].input,'B1');
 assert.equal(context.readContestSamples(['A'],dashboard,'A').waiting,true);
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
 await resetCliState(state);assert.equal(defaultFor(path.join(dir,'A.cpp'),readPreferences(state)),undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('批量样例错误或目标是目录时，不先覆盖前面的文件',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-dashboard-invalid-')),state=path.join(dir,'prefs.json');try{
 await fs.writeFile(path.join(dir,'A.cpp'),'keep');
 await assert.rejects(createContestFiles(dir,'https://codeforces.com/contest/1',[{index:'A',samples},{index:'B',samples:[]}],state),/样例缺失/);assert.equal(await fs.readFile(path.join(dir,'A.cpp'),'utf8'),'keep');
 await fs.mkdir(path.join(dir,'B.cpp'));await assert.rejects(createContestFiles(dir,'https://codeforces.com/contest/1',[{index:'A',samples},{index:'B',samples}],state),/不是普通文件/);assert.equal(await fs.readFile(path.join(dir,'A.cpp'),'utf8'),'keep');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Dashboard 可以导入题面完整但没有普通样例的通信题',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-dashboard-communication-')),state=path.join(dir,'prefs.json');try{
  const result=await createContestFiles(dir,'https://codeforces.com/contest/1',[{index:'A',samples,statement:'# A'},{index:'B',samples:[],statement:'# B\n\nThis is a communication problem.'}],state,'// template');
  assert.equal(await fs.readFile(result.files[1].path,'utf8'),'// template');
  assert.equal(defaultFor(result.files[1].path,readPreferences(state)),'1B');
  assert.match(readPreferences(state).lastAddition.statement,/This is a communication problem/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('浏览器批量流程只打开一个后台题目页，成功后关闭并发送全部题目',async()=>{
 const created=[],removed=[],native=[];const chrome={storage:{local:{get:async()=>({directory:'E:/code',bridgeSecret:'paired',initialContent:'// init',openAfterAdd:{dashboardCpp:false,dashboardStatement:true}})}},tabs:{create:async options=>{created.push(options);return {id:9};},get:async()=>({status:'complete'}),remove:async id=>removed.push(id)},scripting:{executeScript:async options=>options.files?[]:[{result:{problems:['A','B'].map(index=>({index,samples}))}}]},runtime:{sendNativeMessage:async(name,message)=>{if(message.action==='prepare-import')return {mappingOnly:false};native.push(message);return {files:message.problems.map(p=>({name:p.index+'.cpp'}))};}}};
 const context=vm.createContext({URL,dashboardFromUrl,chrome,setTimeout,clearTimeout});vm.runInContext(script,context);
 const result=await context.createDashboardFiles(1,'https://codeforces.com/contest/2278',['A','B']);assert.equal(result.files.length,2);assert.equal(created.length,1);assert.equal(created[0].url,'https://codeforces.com/contest/2278/problems');assert.equal(created[0].active,false);assert.deepEqual(removed,[9]);assert.equal(native[0].action,'create-dashboard');assert.equal(native[0].problems.length,2);assert.equal(native[0].openAfterAdd.dashboardCpp,false);assert.equal(native[0].openAfterAdd.dashboardStatement,true);
});
test('Gym 整场页不可用时复用一个标签逐题补齐，任一题失败时不调用写入',async()=>{
 const url='https://codeforces.com/gym/106725',indices=Array.from('ABCDEFGHIJKLMN');
 for(const failed of [false,true]){
  const visits=[],removed=[],writes=[];
  let now=0,current;
  const chrome={
   storage:{local:{get:async()=>({directory:'E:/code',bridgeSecret:'paired'})}},
   tabs:{
    create:async options=>{visits.push(current=options.url);return {id:9};},
    update:async (id,options)=>{assert.equal(id,9);visits.push(current=options.url);},
    remove:async id=>removed.push(id)
   },
   scripting:{executeScript:async options=>{
    assert.equal(options.injectImmediately,true);
    const [[index],,single]=options.args;
    if(!single)return [{result:{waiting:true}}];
    assert.equal(current,url+'/problem/'+index);
    if(failed&&index==='H')return [{result:{problems:[]}}];
    return [{result:{problems:[{index,samples,statement:'# '+index}]}}];
   }},
   runtime:{sendNativeMessage:async (name,message)=>{if(message.action==='prepare-import')return {mappingOnly:false};writes.push(message);return {files:message.problems};}}
  };
  const context=vm.createContext({URL,dashboardFromUrl,chrome,AbortSignal,fetch:async()=>({ok:false}),Date:{now:()=>now},setTimeout:(callback,delay)=>{
   if(delay!==350)return null;
   now+=delay;queueMicrotask(callback);return null;
  },clearTimeout:()=>{}});
  vm.runInContext(script,context);
  const task=context.createDashboardFiles(1,url,indices);
  if(failed){await assert.rejects(task,/无法读取 H 题题面，未覆盖文件/);assert.equal(writes.length,0);}
  else{
   const result=await task;
   assert.equal(result.files.map(problem=>problem.index).join(''),indices.join(''));
   assert.equal(writes.length,1);assert.equal(writes[0].url,url);
  }
  assert.deepEqual(visits,[url+'/problems',...(failed?indices.slice(0,8):indices).map(index=>url+'/problem/'+index)]);
  assert.deepEqual(removed,[9]);
 }
});
test('比赛模式先报告全部映射，再缓存 HTML 与 PDF 并列出未读题目',async()=>{
 const url='https://codeforces.com/gym/106725',events=[];
 let now=0;
 const chrome={
  storage:{local:{get:async()=>({directory:'E:/code',bridgeSecret:'paired',openAfterAdd:{contestCpp:true}})}},
  tabs:{create:async()=>({id:9}),update:async()=>{},remove:async()=>{},sendMessage:async(id,message)=>events.push(message.text)},
  scripting:{executeScript:async({args:[, , index]})=>[{result:{problems:index?[]:[{index:'A',samples,statement:'# A'}]}}]},
  runtime:{sendNativeMessage:async(name,message)=>{
   events.push(message.action);
   if(message.action==='prepare-import'){
    assert.equal(message.openAfterAdd.contestCpp,true);
    return {mappingOnly:true,importId:'test',files:message.problems.map(p=>({name:p.index+'.cpp'})),openedFiles:['E:/code/A.cpp']};
   }
   if(message.action==='pdf-statement')return {statement:'# PDF 原文',samples,complete:true};
   assert.equal(message.action,'cache-import');assert.match(message.statement,/# A[\s\S]*PDF 原文[\s\S]*H[\s\S]*题面未读取/);return {cached:true};
  }}
 };
 const context=vm.createContext({URL,dashboardFromUrl,chrome,Date:{now:()=>now},AbortSignal,btoa,
  fetch:async target=>target.endsWith('/C')?new Response('%PDF-1.7',{headers:{'Content-Type':'application/pdf'}}):{ok:false},
  setTimeout:(callback,delay)=>{if(delay===350){now+=delay;queueMicrotask(callback);}},clearTimeout:()=>{}});
 vm.runInContext(script,context);
 const result=await context.createDashboardFiles(1,url,['A','C','H']);
 assert.equal(result.files.map(file=>file.name).join(','),'A.cpp,C.cpp,H.cpp');
 assert.deepEqual(result.openedFiles,['E:/code/A.cpp']);
 assert.deepEqual(events,['prepare-import','提交映射已建立，正在读取题面…','pdf-statement','cache-import']);
 assert.equal(result.statementRead.join(','),'A,C');
 assert.match(result.statementFailed.join(''),/^H/);
});
test('本机批量入口认证并持久化实际题号',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-dashboard-native-')),stateFile=path.join(dir,'prefs.json'),secretFile=path.join(dir,'secret');try{
 await fs.writeFile(secretFile,'paired');const request={action:'create-dashboard',secret:'paired',directory:dir,url:'https://codeforces.com/contest/2278',initialContent:'// init',problems:[{index:'A',samples},{index:'C',samples}]};
 assert.match((await handle({...request,secret:'bad'},{stateFile,secretFile})).error,/配对码/);
 const result=await handle(request,{stateFile,secretFile});assert.equal(result.files.length,2);assert.equal(defaultFor(path.join(dir,'C.cpp'),readPreferences(stateFile)),'2278C');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Gym 虚拟赛导入在单题和整场都持久保存 Gym 提交路径',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-gym-native-')),stateFile=path.join(dir,'prefs.json'),secretFile=path.join(dir,'secret');
 const url='https://codeforces.com/gym/106725',options={stateFile,secretFile};
 try{
  await fs.writeFile(secretFile,'paired');
  const base={secret:'paired',directory:dir,initialContent:'// init'};
  const single=await handle({...base,action:'create',url:url+'/problem/H',samples,statement:'# H'},options);
  assert.equal(single.defaultProblem,url+'/problem/H',single.error);
  const result=await handle({...base,action:'create-dashboard',url,problems:['A','H'].map(index=>({index,samples,statement:'# '+index}))},options);
  assert.equal(result.files?.length,2,result.error);
  const state=readPreferences(stateFile);
  assert.equal(state.lastAddition.section,'gym');
  assert.match(state.lastAddition.statement,/Codeforces Gym 106725/);
  assert.deepEqual(parseProblem(defaultFor(path.join(dir,'H.cpp'),state)),{contest:'106725',problem:'H',section:'gym'});
  assert.equal(defaultFor(path.join(dir,'A.cpp'),state),url+'/problem/A');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
