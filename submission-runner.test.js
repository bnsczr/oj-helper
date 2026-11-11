const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {readPreferences,updatePreferences,newContestBoard,submissionStatusContext,refreshSubmissionStatus,selectVerdictMode}=require('./preferences');

async function until(read){
 const deadline=Date.now()+5000;
 while(Date.now()<deadline){const value=read();if(value)return value;await delay(15);}
 assert.fail('等待测试进度超时');
}
function setup(verdictMode='contest'){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'oj-monitor-'));
 const stateFile=path.join(directory,'state.json');
 const job={oj:'cf',contest:'42',problem:'A',language:'GNU G++23',fileName:'A.cpp',source:'int main(){}',verdictMode};
 const board=newContestBoard({contest:'42'},[{index:'A',target:'42A'}]);
 updatePreferences({verdictMode,submissionHistory:[],contestBoard:board},stateFile);
 const context=submissionStatusContext(readPreferences(stateFile),job);
 return {directory,stateFile,options:{job,context,stateFile,secret:'paired',token:'a'.repeat(48),port:0,timeout:4000}};
}
async function workerFixture(run,{timeout,verdictMode}={}){
 const fixture=setup(verdictMode);
 if(timeout)fixture.options.timeout=timeout;
 const child=fork(require.resolve('./submission-runner'),[],{detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const messages=[];let exited=false;
 child.on('message',message=>messages.push(message));
 child.once('exit',()=>{exited=true;});
 child.send(fixture.options);
 try{
  const ready=await until(()=>messages.find(message=>message.type==='ready'));
  const base='http://127.0.0.1:'+ready.port;
  const request=(route,body)=>fetch(base+'/'+route+'?token='+fixture.options.token,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(2000)}).then(response=>response.json());
  await run({...fixture,child,request,messages,read:()=>readPreferences(fixture.stateFile),exit:()=>until(()=>exited)});
 }finally{
  if(!exited){child.kill();await until(()=>exited);}
  fs.rmSync(fixture.directory,{recursive:true,force:true});
 }
}

test('前台在 pending 前退出，切换模式后后台仍保存同一条提交的最终 AC',()=>workerFixture(async({child,request,read,exit,stateFile})=>{
 assert.equal((await request('job')).source,'int main(){}');
 await request('result',{message:'使用编译器：GNU G++23。正在提交。',phase:'submitting'});
 assert.deepEqual(read().submissionHistory,[]);
 assert.equal(read().contestBoard.problems[0].tries,0);
 child.disconnect();
 const submittedAt=Date.now()-30000;
 await request('result',{message:'提交编号：101（已核对账号、题号、编译器及新编号）。',submittedAt});
 const pending=await until(()=>{const state=read();return state.submissionHistory?.[0]?.state==='pending'&&state;});
 assert.equal(pending.contestBoard.problems[0].pending,true);
 assert.equal(pending.contestBoard.problems[0].tries,1);
 assert.equal(pending.submissionHistory[0].submittedAt,submittedAt);
 await selectVerdictMode('normal',stateFile);
 assert.deepEqual(read().submissionHistory,pending.submissionHistory);
 await request('result',{message:'提交 101：CORRECT',rawVerdict:'Accepted',measurements:{time:'31 ms',memory:'0 KB'},final:true,ok:true});
 await exit();
 const final=read();assert.equal(final.submissionHistory[0].verdict,'CORRECT');
 assert.equal(final.submissionHistory.length,1);
 assert.equal(final.submissionHistory[0].rawVerdict,'Accepted');
 assert.equal(final.submissionHistory[0].time,'31 ms');assert.equal(final.submissionHistory[0].memory,'0 KB');
 assert.equal(final.submissionHistory[0].submittedAt,submittedAt);
 assert.equal(final.contestBoard.problems[0].solved,true);
 assert.equal(final.contestBoard.problems[0].pending,false);
 assert.equal(final.contestBoard.problems[0].tries,1);
}));

test('已提交但无法取得结果，超时存为 UNKNOW 且只计一次 try',()=>workerFixture(async({request,read,exit})=>{
 await request('job');
 await request('result',{message:'提交编号：102'});
 await until(()=>read().submissionHistory?.[0]?.state==='pending');
 await exit();
 const state=read();assert.equal(state.submissionHistory[0].state,'unknown');assert.equal(state.submissionHistory[0].verdict,'UNKNOW');
 assert.equal(state.contestBoard.problems[0].tries,1);assert.equal(state.contestBoard.problems[0].pending,false);
},{timeout:350}));

test('checker 等待超时时保留已回报的评测结论',()=>workerFixture(async({request,read,exit,messages})=>{
 await request('job');
 await request('result',{message:'提交编号：102'});
 await request('result',{message:'提交 102：Accepted | 31 ms | 0 KB',phase:'judged'});
 assert.equal(read().submissionHistory[0].verdict,'Accepted');
 assert.equal(read().contestBoard.problems[0].solved,true);
 await exit();
 assert.equal(read().submissionHistory[0].verdict,'Accepted');
 assert.equal(read().contestBoard.problems[0].tries,1);
 assert.match(messages.find(message=>message.event?.final).event.message,/Accepted.*checker：无法得知结果/);
},{timeout:650,verdictMode:'normal'}));

test('未提交就退出时忽略记录，已打开的表单会收到取消并停止点击',()=>workerFixture(async({child,request,read,exit})=>{
 await request('job');
 child.disconnect();await delay(80);
 assert.deepEqual(await request('result',{message:'使用编译器：GNU G++23。正在提交。',phase:'submitting'}),{cancelled:true});
 await request('result',{message:'提交已取消。',final:true,ok:false});
 await exit();assert.deepEqual(read().submissionHistory,[]);assert.equal(read().contestBoard.problems[0].tries,0);
}));

test('表单点击后被网站拒绝且没有确认编号时，不保存 UNKNOW 或 try',()=>workerFixture(async({request,read,exit})=>{
 await request('job');
 await request('result',{message:'使用 QOJ 编译器：C++23。正在提交。',phase:'submitting'});
 await request('result',{message:'网站未接受提交：提交过于频繁',final:true,ok:false});
 await exit();assert.deepEqual(read().submissionHistory,[]);assert.equal(read().contestBoard.problems[0].tries,0);
}));

test('页面重载后回报已确认的编号，即使没有之前的进度事件也保存未知结果',()=>workerFixture(async({request,read,exit})=>{
 await request('job');
 await request('result',{message:'评测读取失败',submissionId:104,final:true,ok:false});
 await exit();
 assert.equal(read().submissionHistory[0].id,'104');assert.equal(read().submissionHistory[0].state,'unknown');
 assert.equal(read().contestBoard.problems[0].tries,1);
}));

test('评测进程异常退出后 status 会把确认提交的 pending 转为 UNKNOW',()=>workerFixture(async({child,request,stateFile,exit})=>{
 await request('job');await request('result',{message:'提交编号：105'});
 await until(()=>readPreferences(stateFile).submissionHistory?.[0]?.state==='pending');
 child.kill();await exit();
 const state=await refreshSubmissionStatus(stateFile);
 assert.equal(state.submissionHistory[0].state,'unknown');assert.equal(state.contestBoard.problems[0].tries,1);
 assert.equal(state.contestBoard.problems[0].pending,false);
}));

test('前台 SIGINT 返回并退出后，独立评测进程仍能接收结果',async()=>{
 const fixture=setup();
 const reservation=require('node:net').createServer();
 await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
 fixture.options.port=reservation.address().port;
 await new Promise(resolve=>reservation.close(resolve));
 const foreground=path.join(fixture.directory,'foreground.js');
 fs.writeFileSync(foreground,`
 const {runSubmission}=require(${JSON.stringify(require.resolve('./submission-runner'))});
 process.on('message',async options=>{
  if(options.type==='interrupt'){process.emit('SIGINT');return;}
  const report=type=>message=>process.send({type,message});
  const code=await runSubmission(options,{status:report('status'),notice:report('notice'),failure:report('failure'),event:report('event')});
  process.send({type:'returned',code},()=>process.disconnect());
 });
 `);
 const child=fork(foreground,[],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
 const messages=[];let exited=false,finished=false;
 child.on('message',message=>messages.push(message));child.once('exit',()=>{exited=true;});
 const request=(route,body)=>fetch('http://127.0.0.1:'+fixture.options.port+'/'+route+'?token='+fixture.options.token,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(2000)}).then(response=>response.json());
 child.send(fixture.options);
 try{
  await until(()=>messages.some(message=>message.type==='status'&&message.message==='等待浏览器领取'));
  // runSubmission generates its own token. Read public metadata as the paired browser.
  const task=await fetch('http://127.0.0.1:'+fixture.options.port+'/pending',{headers:{Authorization:'Bearer paired','X-Oj-Helper-Contest-Mode':'1'},signal:AbortSignal.timeout(2000)}).then(response=>response.json());
  fixture.options.token=task.key.split(':')[1];
  await request('job');
  await request('result',{message:'使用编译器：GNU G++23。正在提交。',phase:'submitting'});
  child.send({type:'interrupt'});
  await until(()=>exited);
  assert.equal(messages.find(message=>message.type==='returned').code,130);
  await request('result',{message:'提交编号：103'});
  await request('result',{message:'提交 103：WRONG-ANSWER',final:true,ok:true});
  await until(()=>readPreferences(fixture.stateFile).submissionHistory?.[0]?.state==='final');finished=true;
  assert.equal(readPreferences(fixture.stateFile).submissionHistory[0].verdict,'WRONG-ANSWER');
 }finally{
  if(!exited){child.kill();await until(()=>exited);}
  if(!finished)await delay(fixture.options.timeout+100);
  fs.rmSync(fixture.directory,{recursive:true,force:true});
 }
});
