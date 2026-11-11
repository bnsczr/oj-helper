const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {handle}=require('./native-host');
const {saveStatement}=require('./open');
const {defaultFor,readPreferences,selectVerdictMode,selectOj,submissionStatusContext,recordSubmission,refreshSubmissionStatus,newContestBoard,updatePreferences,fileKey}=require('./preferences');
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

test('CF 比赛模式只更新提交映射，切回正常模式恢复模板和样例',()=>fixture(async({directory,stateFile,opened,add})=>{
 await selectOj('qoj',stateFile);
 const filename=path.join(directory,'B1.cpp');await fs.writeFile(filename,'previous source');await fs.writeFile(path.join(directory,'A.cpp'),'keep');
 const request={action:'create',url:'https://codeforces.com/contest/42/problem/B1',samples,statement:'# B1. Problem',openAfterAdd:{problemCpp:true,problemStatement:false}};
 const added=await add(request);assert.equal(added.name,'B1.cpp');assert.equal(added.mappingOnly,true);assert.equal(added.sampleCount,0);
 assert.equal(await fs.readFile(filename,'utf8'),'previous source');assert.equal(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),'keep');
 assert.equal(readPreferences(stateFile).activeOj,'cf');assert.equal(defaultFor(filename,readPreferences(stateFile)),'42B1');assert.deepEqual(opened,[]);
 await selectVerdictMode('normal',stateFile);await selectOj('qoj',stateFile);const normal=await add(request);assert.equal(normal.name,'B1.cpp');assert.equal(normal.mappingOnly,undefined);assert.equal(readPreferences(stateFile).activeOj,'cf');
 assert.match(await fs.readFile(filename,'utf8'),/\/\/ template[\s\S]*样例 1/);
}));

test('CF Dashboard 先建立所有映射，稍后缓存题面，已有源码及题面文件不受影响',()=>fixture(async({directory,stateFile,add})=>{
 await selectOj('qoj',stateFile);
 await fs.writeFile(path.join(directory,'A.cpp'),'previous source');
 const added=await add({action:'prepare-import',oj:'cf',url:'https://codeforces.com/contest/42',problems:[{index:'A'},{index:'B1'}]});
 assert.equal(added.mappingOnly,true);assert.equal(readPreferences(stateFile).activeOj,'cf');assert.deepEqual(added.files.map(file=>file.name),['A.cpp','B1.cpp']);
 for(const file of added.files)assert.equal(defaultFor(file.path,readPreferences(stateFile),'cf'),'42'+file.name.slice(0,-4));
 assert.equal(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),'previous source');
 await assert.rejects(fs.stat(path.join(directory,'B1.cpp')),{code:'ENOENT'});
 await add({action:'cache-import',oj:'cf',importId:added.importId,statement:'# First problem\n\n# Second problem'});
 await assert.rejects(fs.stat(path.join(directory,'statement.md')),{code:'ENOENT'});
 await saveStatement(readPreferences(stateFile));
 assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),/First problem[\s\S]*Second problem/);
}));

test('QOJ 单题和 Dashboard 只建立提交映射，保留比赛字母和题库数字',()=>fixture(async({directory,stateFile,add})=>{
 const a={url:'https://qoj.ac/contest/42/problem/123',title:'A. Example',statement:'# A. Example',samples};
 const b={url:'https://qoj.ac/contest/42/problem/124',title:'B1. Example',statement:'# B1. Example',samples};
 await fs.writeFile(path.join(directory,'B1.cpp'),'previous source');
 const single=await add({action:'qoj-create',problem:b});assert.equal(single.name,'B1.cpp');assert.equal(single.mappingOnly,true);
 assert.equal(await fs.readFile(single.path,'utf8'),'previous source');assert.equal(readPreferences(stateFile).activeOj,'qoj');assert.equal(defaultFor(single.path,readPreferences(stateFile)),b.url);
 const practice=await add({action:'qoj-create',problem:{...a,url:'https://qoj.ac/problem/125'}});assert.equal(practice.name,'125.cpp');assert.equal(defaultFor(practice.path,readPreferences(stateFile),'qoj'),'125');
 await selectOj('cf',stateFile);
 const dashboard=await add({action:'qoj-create-dashboard',url:'https://qoj.ac/contest/42',problems:[{...a,index:'A'},{...b,index:'B1'}],openAfterAdd:{dashboardCpp:false,dashboardStatement:true}});
 assert.equal(dashboard.mappingOnly,true);assert.equal(readPreferences(stateFile).activeOj,'qoj');assert.deepEqual(dashboard.files.map(file=>file.name),['A.cpp','B1.cpp']);
 for(const [index,file] of dashboard.files.entries())assert.equal(defaultFor(file.path,readPreferences(stateFile),'qoj'),[a,b][index].url);
 const qojState=readPreferences(stateFile);
 const qojA=submissionStatusContext(qojState,{oj:'qoj',contest:'42',problem:'123',url:a.url,verdictMode:'contest'});
 await recordSubmission(qojA,'201',{id:'201',verdict:'CORRECT, TIME-LIMIT',solved:false},stateFile);
 assert.deepEqual(readPreferences(stateFile).qoj.contestBoard.problems.map(({index,tries,solved})=>[index,tries,solved]),[['A',1,false],['B1',0,false]]);
 await assert.rejects(fs.stat(path.join(directory,'A.cpp')),{code:'ENOENT'});
 await assert.rejects(fs.stat(path.join(directory,'statement.md')),{code:'ENOENT'});
 await saveStatement(readPreferences(stateFile));
 assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),/A\. Example[\s\S]*B1\. Example[\s\S]*导入样例/);
}));

test('比赛模式可自动打开 CF 和 QOJ 单题及 Dashboard 源码，补建空文件并保留已有内容',async()=>{
 for(const oj of ['cf','qoj'])await fixture(async({directory,stateFile,opened,add})=>{
  const url=oj==='cf'?'https://codeforces.com/contest/42':'https://qoj.ac/contest/42';
  const a={index:'A',url:url+'/problem/'+(oj==='cf'?'A':'123'),title:'A. Example'};
  const b={index:'B',url:url+'/problem/'+(oj==='cf'?'B':'124'),title:'B. Example'};
  const openAfterAdd={contestCpp:true,problemCpp:false,dashboardCpp:false,problemStatement:true,dashboardStatement:true};
  const aFile=path.join(directory,'A.cpp'),bFile=path.join(directory,'B.cpp');
  const single=await add({action:'prepare-import',oj,url:a.url,title:a.title,openAfterAdd});
  assert.equal(single.mappingOnly,true);
  assert.deepEqual(single.openedFiles,[aFile]);
  assert.equal(await fs.readFile(aFile,'utf8'),'');
  await fs.writeFile(aFile,'existing source');
  const dashboard=await add({action:'prepare-import',oj,url,problems:[a,b],openAfterAdd});
  assert.deepEqual(dashboard.openedFiles,[aFile,bFile]);
  assert.deepEqual(opened,[[aFile],[aFile,bFile]]);
  assert.equal(await fs.readFile(aFile,'utf8'),'existing source');
  assert.equal(await fs.readFile(bFile,'utf8'),'');
  assert.equal(defaultFor(bFile,readPreferences(stateFile)),oj==='cf'?'42B':b.url);
  await assert.rejects(fs.stat(path.join(directory,'statement.md')),{code:'ENOENT'});
 });
});

test('比赛尝试数独立于最近十条，首个 AC 冻结计数，重新导入与切换隔离旧结果',()=>fixture(async({stateFile,add})=>{
 const url='https://codeforces.com/gym/106725',problems=[{index:'A'},{index:'B'},{index:'C'}];
 const start=()=>add({action:'prepare-import',oj:'cf',url,problems});
 await start();
 const spec={oj:'cf',section:'gym',contest:'106725',problem:'A',verdictMode:'contest'};
 const a=submissionStatusContext(readPreferences(stateFile),spec);
 const b=submissionStatusContext(readPreferences(stateFile),{...spec,problem:'B'});
 for(let i=1;i<=13;i++){
  const id=String(i);
  await recordSubmission(a,id,null,stateFile);
  await recordSubmission(a,id,{id,solved:i===12,verdict:i===12?'CORRECT':'WRONG-ANSWER'},stateFile);
 }
 await recordSubmission(b,'14',null,stateFile);
 const state=readPreferences(stateFile);
 assert.deepEqual(state.submissionHistory.map(item=>Number(item.id)),[13,12,11,10,9,8,7,6,5,4]);
 assert.deepEqual(state.contestBoard.problems.map(({tries,solved})=>[tries,solved]),[[12,true],[1,false],[0,false]]);
 await selectVerdictMode('normal',stateFile);
 await recordSubmission(a,'15',{id:'15',solved:true},stateFile);
 assert.deepEqual(readPreferences(stateFile).submissionHistory.map(item=>Number(item.id)),[15,13,12,11,10,9,8,7,6,5]);
 await selectVerdictMode('contest',stateFile);
 await start();
 await recordSubmission(b,'16',{id:'16',solved:true},stateFile);
 assert.deepEqual(readPreferences(stateFile).contestBoard.problems.map(item=>item.tries),[0,0,0]);
 await selectOj('qoj',stateFile);
 assert.deepEqual(readPreferences(stateFile).submissionHistory,[]);
}));

test('pending 和未知结果计一次 try，多次回报不会重复累计，AC 后保持通过状态',()=>fixture(async({stateFile,add})=>{
 await add({action:'prepare-import',oj:'cf',url:'https://codeforces.com/contest/42',problems:[{index:'A'}]});
 const context=submissionStatusContext(readPreferences(stateFile),{oj:'cf',contest:'42',problem:'A',verdictMode:'contest'});
 const record=(id,state,solved=false)=>recordSubmission(context,id,{id,state,solved,verdict:state==='pending'?'pending':state==='unknown'?'UNKNOW':solved?'CORRECT':'WRONG-ANSWER'},stateFile);
 await record('1','pending');await record('2','pending');await record('1','final');
 let state=readPreferences(stateFile),problem=state.contestBoard.problems[0];
 assert.equal(problem.tries,2);assert.equal(problem.pending,true);
 assert.deepEqual(state.submissionHistory.map(entry=>entry.id),['2','1']);
 await record('2','unknown');await record('2','unknown');
 problem=readPreferences(stateFile).contestBoard.problems[0];assert.equal(problem.tries,2);assert.equal(problem.pending,false);
 await record('3','pending');await record('3','final',true);await record('4','pending');await record('4','unknown');
 problem=readPreferences(stateFile).contestBoard.problems[0];assert.equal(problem.tries,3);assert.equal(problem.solved,true);assert.equal(problem.pending,false);
}));

test('status 将过期的已确认提交转为 UNKNOW，保留 try 并取消蓝色 pending',()=>fixture(async({stateFile,add})=>{
 await add({action:'prepare-import',oj:'cf',url:'https://codeforces.com/contest/42',problems:[{index:'A'}]});
 const context=submissionStatusContext(readPreferences(stateFile),{oj:'cf',contest:'42',problem:'A',verdictMode:'contest'});
 await recordSubmission(context,'1',{id:'1',state:'pending',deadline:Date.now()-1,monitorPid:process.pid},stateFile);
 const state=await refreshSubmissionStatus(stateFile);
 assert.equal(state.submissionHistory[0].state,'unknown');assert.equal(state.submissionHistory[0].verdict,'UNKNOW');
 assert.equal(state.contestBoard.problems[0].pending,false);assert.equal(state.contestBoard.problems[0].tries,1);
 await recordSubmission(context,'1',{id:'1',state:'final',verdict:'CORRECT',solved:true},stateFile);
 assert.equal(readPreferences(stateFile).contestBoard.problems[0].tries,1);
 assert.equal(readPreferences(stateFile).contestBoard.problems[0].solved,true);
}));

test('Dashboard 题目颜色各不相同，按背景亮度选择清晰的题号颜色',()=>{
 const problems=Array.from({length:1000},(_,index)=>({index:String(index),target:'42/'+index}));
 const board=newContestBoard({contest:'42'},problems);
 assert.equal(new Set(board.problems.map(problem=>problem.headerColor)).size,problems.length);
 for(const {headerColor} of board.problems){
  assert.match(headerColor,/^(?:30|97);48;2;\d+;\d+;\d+$/);
  const channels=headerColor.split(';').slice(3).map(Number);
  for(const channel of channels)assert.ok(channel>=0&&channel<=255);
  const linear=channels.map(channel=>{const value=channel/255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;});
  const luminance=linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
  const contrast=headerColor.startsWith('30;')?(luminance+0.05)/0.05:1.05/(luminance+0.05);
  assert.ok(contrast>=4.5);
 }
});

test('正常模式可从旧版 Gym 目录映射恢复所有题和现存结果，后续提交继续累计',()=>fixture(async({directory,stateFile})=>{
 await selectVerdictMode('normal',stateFile);
 const target=index=>'https://codeforces.com/gym/106725/problem/'+index;
 updatePreferences({
  lastAddition:{kind:'contest',contest:'106725',section:'gym',directory},
  fileProblems:Object.fromEntries(['A','B','C'].map(index=>[fileKey(path.join(directory,index+'.cpp')),target(index)])),
  submissionHistory:[
   {id:'4',problem:'Gym 106725C',file:'C.cpp',verdict:'WRONG-ANSWER'},
   {id:'3',problem:'Gym 106725C',file:'C.cpp',verdict:'CORRECT'},
   {id:'2',problem:'42C',file:'C.cpp',verdict:'WRONG-ANSWER'},
   {id:'1',problem:'Gym 106725C',file:'C.cpp',verdict:'WRONG-ANSWER'}
  ]
 },stateFile);
 const restored=await refreshSubmissionStatus(stateFile),board=restored.contestBoard;
 assert.deepEqual(board.problems.map(({index,tries,solved})=>[index,tries,solved]),[['A',0,false],['B',0,false],['C',2,true]]);
 assert.deepEqual((await refreshSubmissionStatus(stateFile)).contestBoard,board);
 const context=submissionStatusContext(restored,{oj:'cf',section:'gym',contest:'106725',problem:'B',verdictMode:'normal'});
 await recordSubmission(context,'5',{id:'5',state:'pending'},stateFile);
 const problem=readPreferences(stateFile).contestBoard.problems[1];assert.equal(problem.tries,1);assert.equal(problem.pending,true);
}));

test('QOJ 旧版映射按字母恢复状态并隔离不同比赛与保存目录',()=>fixture(async({directory,stateFile})=>{
 await selectOj('qoj',stateFile);
 updatePreferences({qoj:{
  lastAddition:{kind:'contest',contest:'42',section:'contest',directory},
  fileProblems:{
   [fileKey(path.join(directory,'A.cpp'))]:'https://qoj.ac/contest/42/problem/123',
   [fileKey(path.join(directory,'B1.cpp'))]:'https://qoj.ac/contest/42/problem/124',
   [fileKey(path.join(directory,'C.cpp'))]:'https://qoj.ac/contest/43/problem/125',
   [fileKey(path.join(directory,'other','D.cpp'))]:'https://qoj.ac/contest/42/problem/126'
  }
 },submissionHistory:[
  {id:'2',problem:'QOJ #124 / 比赛 42',state:'pending',verdict:'pending'},
  {id:'1',problem:'QOJ #123 / 比赛 42',verdict:'CORRECT'}
 ]},stateFile);
 const restored=await refreshSubmissionStatus(stateFile);
 assert.deepEqual(restored.qoj.contestBoard.problems.map(({index,tries,solved,pending})=>[index,tries,solved,pending]),[['A',1,true,false],['B1',1,false,true]]);
 assert.equal(restored.contestBoard,undefined);
}));

test('正常模式下 CF 与 QOJ 的提交更新逐题统计，切换比赛模式后保留统计',()=>fixture(async({directory,stateFile,add})=>{
 await selectVerdictMode('normal',stateFile);
 await add({action:'create-dashboard',url:'https://codeforces.com/contest/42',problems:[{index:'A',samples,statement:'# A'},{index:'B',samples,statement:'# B'}]});
 const cf=submissionStatusContext(readPreferences(stateFile),{oj:'cf',contest:'42',problem:'A',verdictMode:'normal'});
 await recordSubmission(cf,'101',{id:'101',state:'pending',verdict:'pending'},stateFile);
 assert.equal(readPreferences(stateFile).contestBoard.problems[0].pending,true);
 await recordSubmission(cf,'101',{id:'101',state:'final',verdict:'Accepted',solved:true},stateFile);
 const board=readPreferences(stateFile).contestBoard;
 assert.deepEqual(board.problems.map(problem=>problem.index),['A','B']);
 assert.deepEqual(board.problems.map(({tries,solved})=>[tries,solved]),[[1,true],[0,false]]);
 await selectVerdictMode('contest',stateFile);
 assert.deepEqual((await refreshSubmissionStatus(stateFile)).contestBoard,board);
 assert.match(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),/template/);
 await selectVerdictMode('normal',stateFile);
 await add({action:'qoj-create-dashboard',url:'https://qoj.ac/contest/43',problems:[{index:'A',url:'https://qoj.ac/contest/43/problem/123',samples,statement:'# A'}]});
 const qoj=submissionStatusContext(readPreferences(stateFile),{oj:'qoj',contest:'43',problem:'123',url:'https://qoj.ac/contest/43/problem/123',verdictMode:'normal'});
 await recordSubmission(qoj,'201',{id:'201',state:'final',verdict:'Wrong Answer',solved:false},stateFile);
 const qojBoard=readPreferences(stateFile).qoj.contestBoard;
 assert.deepEqual(qojBoard.problems.map(({tries,solved})=>[tries,solved]),[[1,false]]);
 await selectVerdictMode('contest',stateFile);
 assert.deepEqual((await refreshSubmissionStatus(stateFile)).qoj.contestBoard,qojBoard);
 assert.deepEqual(qojBoard.problems.map(problem=>problem.index),['A']);
}));

test('普通模式在题面返回前即可提交，随后补全文件并保留提交统计及编辑',async()=>{
 for(const oj of ['cf','qoj'])await fixture(async({directory,stateFile,add})=>{
  await selectVerdictMode('normal',stateFile);
  const url=oj==='cf'?'https://codeforces.com/contest/42':'https://qoj.ac/contest/42';
  const problems=['A','B'].map((index,i)=>({index,url:url+'/problem/'+(oj==='cf'?index:123+i),samples,statement:'# '+index}));
  const a=path.join(directory,'A.cpp'),b=path.join(directory,'B.cpp');
  await fs.writeFile(a,'old source');
  const startedAt=Date.now()-25*60000;
  const prepared=await add({action:'prepare-import',oj,url,earlyMapping:true,startedAt,problems:problems.map(({index,url})=>({index,url}))});
  assert.equal(prepared.mappingOnly,false);
  const state=readPreferences(stateFile),profile=oj==='cf'?state:state.qoj;
  assert.equal(profile.contestBoard.id,prepared.importId);
  assert.equal(profile.contestBoard.startedAt,startedAt);
  assert.deepEqual(profile.contestBoard.problems.map(p=>p.index),['A','B']);
  assert.equal(defaultFor(a,state),oj==='cf'?'42A':problems[0].url);
  assert.equal(await fs.readFile(a,'utf8'),'old source');
  await assert.rejects(fs.stat(b),{code:'ENOENT'});
  const context=submissionStatusContext(state,{oj,contest:'42',problem:oj==='cf'?'A':'123',url:problems[0].url,verdictMode:'normal'});
  await fs.writeFile(a,'edited during statement read');
  const attempt=(id,minute,verdict,extra={})=>recordSubmission(context,id,{id,submittedAt:startedAt+minute*60000,verdict,...extra},stateFile);
  await attempt('98',4,'UNKNOW-ERROR',{rawVerdict:'Compilation error'});
  await attempt('99',8,'WRONG-ANSWER');
  await attempt('99',8,'WRONG-ANSWER');
  await attempt('100',10,'UNKNOW',{state:'unknown'});
  await attempt('101',23,'Accepted',{solved:true});
  await attempt('102',24,'WRONG-ANSWER');
  const result=await add({action:oj==='cf'?'create-dashboard':'qoj-create-dashboard',url,finishId:prepared.importId,problems});
  const final=readPreferences(stateFile),board=(oj==='cf'?final:final.qoj).contestBoard;
  assert.equal(board.id,prepared.importId);
  assert.deepEqual(board.problems.map(({tries,solved})=>[tries,solved]),[[4,true],[0,false]]);
  assert.equal(board.startedAt,startedAt);
  assert.equal(board.problems[0].solvedMinutes,23);
  assert.equal(board.problems[0].penaltyMinutes,43);
  assert.equal(final.submissionHistory[0].id,'102');
  assert.match(result.warnings.join('\n'),/A\.cpp.*保留现有源码/);
  assert.equal(await fs.readFile(a,'utf8'),'edited during statement read');
  assert.match(await fs.readFile(b,'utf8'),/template[\s\S]*样例/);
 });
});
