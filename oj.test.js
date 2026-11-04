const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {main}=require('./oj');
const {main:open}=require('./open');
const {readPreferences,updatePreferences,selectOj,saveDefault,fileKey}=require('./preferences');

function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'oj-mode-'));
 const stateFile=path.join(directory,'.submit-preferences.json');
 return {directory,stateFile,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
function installFixture(directory){
 for(const name of ['oj.js','cli.js','preferences.js','bridge.js','wakeup.js','open.js','editor.js','standings-report.js'])fs.copyFileSync(path.join(__dirname,name),path.join(directory,name));
 fs.mkdirSync(path.join(directory,'extension'),{recursive:true});fs.copyFileSync(path.join(__dirname,'extension','qoj.js'),path.join(directory,'extension','qoj.js'));
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
  assert.deepEqual(readPreferences(stateFile),{...original,activeOj:'qoj'});
  const cf=run('oj.js',['cF']);assert.equal(cf.status,0,cf.stderr);assert.match(cf.stdout,/已切换到 Codeforces/);
  assert.deepEqual(readPreferences(stateFile),{...original,activeOj:'cf'});
  fs.writeFileSync(source,'int main(){}');
  const submit=run('cli.js',['B.cpp'],'n\n');assert.equal(submit.status,0,submit.stderr);assert.match(submit.stdout,/题目：2278B/);assert.match(submit.stdout,/已取消/);
  assert.equal(fs.existsSync(path.join(directory,'.bridge-secret')),false);
 }finally{cleanup();}
});

test('QOJ submit 使用独立默认题号，clear 只清 QOJ 而不影响 CF',async()=>{
 const {directory,stateFile,cleanup}=fixture();
 try{
  updatePreferences({defaultProblem:'2278B',languages:{cpp:'GNU G++23'},lastAddition:{kind:'contest',contest:'2278',directory,statement:'# CF statement'}},stateFile);
  await selectOj('qoj',stateFile);updatePreferences({qoj:{defaultProblem:'123'}},stateFile);fs.writeFileSync(path.join(directory,'A.cpp'),'int main(){}');const run=installFixture(directory);
  const result=run('cli.js',['A.cpp'],'n\n');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/QOJ #123/);assert.match(result.stdout,/C\+\+23/);assert.doesNotMatch(result.stdout,/2278B/);
  const cleared=run('cli.js',['clear']);assert.equal(cleared.status,0,cleared.stderr);assert.equal(readPreferences(stateFile).qoj.defaultProblem,null);assert.equal(readPreferences(stateFile).defaultProblem,'2278B');
  assert.equal(fs.existsSync(path.join(directory,'.bridge-secret')),false);
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
