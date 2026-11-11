const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {main}=require('./oj');
const {main:open}=require('./open');
const {readPreferences,updatePreferences,selectOj,saveDefault,fileKey,submissionStatusContext,recordSubmission,updateOjPreferences}=require('./preferences');

function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'oj-mode-'));
 const stateFile=path.join(directory,'.submit-preferences.json');
 return {directory,stateFile,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
function installFixture(directory){
 fs.mkdirSync(path.join(directory,'extension'),{recursive:true});
 for(const name of ['oj.js','cli.js','mode.js','preferences.js','bridge.js','wakeup.js','submission-runner.js','open.js','editor.js','standings-report.js','terminal-ui.js','extension/qoj.js','extension/verdict.js'])fs.copyFileSync(path.join(__dirname,name),path.join(directory,name));
 return (entry,args=[],input)=>{
  const result=spawnSync(process.execPath,[path.join(directory,entry),...args],{cwd:directory,input,encoding:'utf8',timeout:10000});
  assert.ifError(result.error);return result;
 };
}

test('首次运行 oj 默认 CF，查看状态或帮助不会创建配置',async()=>{
 const {stateFile,cleanup}=fixture();
 try{
  for(const args of [[],['--help'],['-h']]){
   const logs=[];const mode=await main(args,{stateFile,log:message=>logs.push(message)});
   assert.equal(mode.id,'cf');assert.match(logs[0],/当前 OJ：Codeforces/);assert.ok(logs.some(message=>message.includes('oj qoj')));
  }
  assert.equal(fs.existsSync(stateFile),false);
 }finally{cleanup();}
});

test('oj 模式不区分大小写，跨进程持久化，切换不丢失 CF 题号与题面',()=>{
 const {directory,stateFile,cleanup}=fixture();
 try{
  const source=path.join(directory,'B.cpp');const original={defaultProblem:'2278D',fileProblems:{[fileKey(source)]:'2278B'},languages:{cpp:'GNU G++23'},assignments:{saved:{next:2,problems:{'2278B':'B.cpp'}}},lastAddition:{kind:'contest',contest:'2278',directory,statement:'# Saved CF statement'}};
  updatePreferences(original,stateFile);const run=installFixture(directory);
  const qoj=run('oj.js',['qOj']);assert.equal(qoj.status,0,qoj.stderr);assert.match(qoj.stdout,/已切换到 QOJ/);
  const status=run('oj.js');assert.equal(status.status,0);assert.match(status.stdout,/当前 OJ：QOJ/);
  assert.deepEqual(readPreferences(stateFile),{...original,activeOj:'qoj',submissionHistory:[],submissionHistoryVersion:1});
  const cf=run('oj.js',['cF']);assert.equal(cf.status,0,cf.stderr);assert.match(cf.stdout,/已切换到 Codeforces/);
  assert.deepEqual(readPreferences(stateFile),{...original,activeOj:'cf',submissionHistory:[],submissionHistoryVersion:2});
  fs.writeFileSync(source,'int main(){}');
  const submit=run('cli.js',['B.cpp'],'n\n');assert.equal(submit.status,0,submit.stderr);assert.match(submit.stdout,/题号  2278B/);assert.match(submit.stdout,/已取消/);
  assert.equal(fs.existsSync(path.join(directory,'.bridge-secret')),false);
 }finally{cleanup();}
});

test('submit status 按当前模式显示同一份提交历史，clear 清除提交与题目状态',()=>{
 const {directory,stateFile,cleanup}=fixture();
 try{
  updatePreferences({verdictMode:'contest',contestBoard:{contest:'42',section:'contest',problems:[
   {index:'A',tries:2,solved:true},{index:'B',tries:1,solved:false},{index:'C',tries:0,solved:false}
  ]}},stateFile);
  const submissionHistory=[
   {id:'103',problem:'42A',file:'A.cpp',verdict:'Accepted'},
   {id:'102',problem:'42B',file:'B.cpp',verdict:'WRONG-ANSWER',rawVerdict:'Wrong answer on test 9',time:'62 ms',memory:'100 KB'},
   {id:'101',problem:'42B',file:'B.cpp',verdict:'TIME-LIMIT'}
  ];
  updatePreferences({submissionHistory},stateFile);
  const run=installFixture(directory);
  const status=run('cli.js',['status']);
  assert.equal(status.status,0,status.stderr);
  assert.match(status.stdout,/过题 1\/3/);
  const boardPattern=/│ +A +│ +B +│ +C +│\r?\n├.*\r?\n│ +2 tries +│ +1 try +│ +│/;
  assert.match(status.stdout,boardPattern);
  assert.match(status.stdout,/#103.*42A.*CORRECT[\s\S]*#102.*42B.*WRONG-ANSWER/);
  assert.doesNotMatch(status.stdout,/test 9|耗时|62 ms|100 KB/);
  assert.equal(run('mode.js',['normal']).status,0);
  const normal=run('cli.js',['status']);
  assert.equal(normal.status,0,normal.stderr);
  assert.match(normal.stdout,boardPattern);
  assert.match(normal.stdout,/#103.*42A.*Accepted[\s\S]*#102.*42B.*Wrong answer on test 9.*62 ms.*100 KB/);
  assert.match(normal.stdout,/#101.*TIME-LIMIT.*\| +- +\| +-/);
  assert.equal(run('mode.js',['contest']).status,0);
  assert.equal(run('cli.js',['status']).stdout,status.stdout);
  assert.deepEqual(readPreferences(stateFile).submissionHistory,submissionHistory);
  assert.equal(run('cli.js',['clear']).status,0);
  const cleared=run('cli.js',['status']);
  assert.match(cleared.stdout,/暂无提交结果/);
  assert.doesNotMatch(cleared.stdout,/过题|#103/);
 }finally{cleanup();}
});

test('submit clear 从 QOJ 比赛模式重置两站，保留配对和源码，忽略迟到的结果',async()=>{
 const {directory,stateFile,cleanup}=fixture();
 try{
  updatePreferences({defaultProblem:'2278B',languages:{cpp:'GNU G++23'},lastAddition:{kind:'contest',contest:'2278',directory,statement:'# CF statement'}},stateFile);
  await selectOj('qoj',stateFile);
  const board={id:'qoj-board',problems:[{target:'123',index:'A',tries:1,solved:false}]};
  updatePreferences({verdictMode:'contest',qoj:{defaultProblem:'123',fileProblems:{'A.cpp':'123'},contestBoard:board}},stateFile);
  updatePreferences({submissionHistory:[{id:'90',verdict:'CORRECT'}]},stateFile);
  const state=readPreferences(stateFile);
  const pending=submissionStatusContext(state,{oj:'qoj',problem:'123',verdictMode:'contest'});
  const source=path.join(directory,'A.cpp'),pair=path.join(directory,'.bridge-secret');
  fs.writeFileSync(source,'int main(){}');
  const run=installFixture(directory);
  const result=run('cli.js',['A.cpp'],'n\n');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/QOJ #123/);assert.match(result.stdout,/C\+\+23/);assert.doesNotMatch(result.stdout,/2278B/);
  assert.equal(fs.existsSync(path.join(directory,'.bridge-secret')),false);
  fs.writeFileSync(pair,'paired-fixture');
  const cleared=run('cli.js',['clear']);assert.equal(cleared.status,0,cleared.stderr);
  assert.match(run('oj.js').stdout,/当前 OJ：Codeforces/);
  assert.match(run('mode.js',['status']).stdout,/正常模式/);
  assert.deepEqual(readPreferences(stateFile),{submissionHistoryVersion:pending.version+1});
  await recordSubmission(pending,'91',{id:'91',solved:true,verdict:'CORRECT'},stateFile);
  await updateOjPreferences({languages:{cpp:'old'}},'qoj',stateFile,pending.version);
  assert.deepEqual(readPreferences(stateFile),{submissionHistoryVersion:pending.version+1});
  assert.equal(fs.readFileSync(pair,'utf8'),'paired-fixture');
  assert.equal(fs.readFileSync(source,'utf8'),'int main(){}');
 }finally{cleanup();}
});

test('QOJ open s 使用 QOJ 题面，open b 缺少上下文时选择比赛并保存完整外部榜单',async()=>{
 const {directory,stateFile,cleanup}=fixture();
 try{
  const target=path.join(directory,'statement.md');fs.writeFileSync(target,'keep statement');
  const cf={kind:'contest',contest:'2278',directory,statement:'# CF statement'};
  updatePreferences({activeOj:'qoj',lastAddition:cf,qoj:{lastAddition:{oj:'qoj',kind:'problem',problem:'123',contest:null,contests:['42'],directory,statement:'# QOJ statement'}}},stateFile);
  const opened=[];await open(['s'],{stateFile,log:()=>{},openEditor:async file=>opened.push(file)});assert.equal(fs.readFileSync(target,'utf8'),'# QOJ statement');
  await open(['b'],{stateFile,log:()=>{},chooseContest:async options=>{assert.equal(options[0],'https://qoj.ac/contest/42');return options[0];},openEditor:async file=>opened.push(file),openBoard:async state=>{assert.equal(state.qoj.lastAddition.contest,'42');return {oj:'qoj',kind:'external-standings',contest:'42',contestUrl:'https://qoj.ac/contest/42',url:'https://qoj.ac/results/QOJ42',headers:['Rank.','Username','A'],rows:[['1','Team','+\n0:01']]};}});
  assert.equal(readPreferences(stateFile).qoj.lastAddition.contest,'42');assert.deepEqual(readPreferences(stateFile).lastAddition,cf);assert.match(fs.readFileSync(path.join(directory,'standings.md'),'utf8'),/External Standings.*\n/s);assert.equal(opened.length,2);
 }finally{cleanup();}
});

test('无效 OJ 或多余参数不改变模式，并发保存题号不覆盖模式选择',async()=>{
 const {directory,stateFile,cleanup}=fixture();
 try{
  await selectOj('qoj',stateFile);const before=fs.readFileSync(stateFile,'utf8');
  for(const args of [['unknown'],['CF','extra'],['constructor']]){
   await assert.rejects(main(args,{stateFile,log:()=>{}}),/oj CF.*oj qoj/);
   assert.equal(fs.readFileSync(stateFile,'utf8'),before);
  }
  await Promise.all([selectOj('CF',stateFile),saveDefault(path.join(directory,'A.cpp'),'1A',stateFile,'cf')]);
  const state=readPreferences(stateFile);assert.equal(state.activeOj,'cf');assert.equal(state.defaultProblem,'1A');
 }finally{cleanup();}
});
