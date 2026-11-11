const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBridge}=require('./bridge');
const {isFinalVerdict}=require('./extension/verdict');
test('桥接认证、单次任务、进度事件与最终结果',async()=>{
 const events=[];const server=createBridge({secret:'paired',token:'task',job:{contest:'1',problem:'A',source:'int main(){}'},onEvent:e=>events.push(e)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/pending')).status,403);
  const request=()=>fetch(base+'/pending',{headers:{Authorization:'Bearer paired'}}).then(r=>r.json());
  assert.equal((await request()).contest,'1');assert.deepEqual(await request(),{});
  assert.equal((await fetch(base+'/job?token=bad')).status,403);
  assert.equal((await fetch(base+'/job?token=task').then(r=>r.json())).source,'int main(){}');
  assert.equal((await fetch(base+'/job?token=task')).status,404);
  for(const event of [{message:'Testing on test 3'},{message:'Accepted',final:true,ok:true}])assert.equal((await fetch(base+'/result?token=task',{method:'POST',body:JSON.stringify(event)})).status,200);
  assert.equal(events.length,2);assert.equal(events[1].final,true);
  assert.equal((await fetch(base+'/result?token=task',{method:'POST',body:'{}'})).status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('只将终态判定为结果',()=>{
 for(const s of ['Accepted','Wrong answer on test 2','Compilation error','Time limit exceeded on test 8','Runtime error on test 1'])assert.equal(isFinalVerdict(s),true);
 for(const s of ['In queue','Running on test 6','Testing on test 1','Judging',''])assert.equal(isFinalVerdict(s),false);
});
test('QOJ 任务不会被旧 CF 扩展领走，健康检查不领取或泄露任务',async()=>{
 let announced=0;const server=createBridge({secret:'paired',token:'task',job:{oj:'qoj',problem:'123',source:'private-source'},onEvent:()=>{},onAnnounce:()=>announced++});server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const headers={Authorization:'Bearer paired'};
  assert.equal((await fetch(base+'/health')).status,403);
  const health=await fetch(base+'/health',{headers}).then(response=>response.json());assert.equal(health.announced,false);assert.equal(JSON.stringify(health).includes('private-source'),false);
  assert.deepEqual(await fetch(base+'/pending',{headers}).then(response=>response.json()),{});assert.equal(announced,0);
  const task=await fetch(base+'/pending',{headers:{...headers,'X-Oj-Helper-Platforms':'cf,qoj'}}).then(response=>response.json());assert.equal(task.oj,'qoj');assert.equal(task.problem,'123');assert.equal(announced,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
for(const section of [undefined,'gym'])test('扩展在后台打开 '+(section||'contest')+' 个人提交页',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');const created=[];let alarm;
 const chrome={storage:{local:{get:async()=>({bridgeSecret:'paired'})}},alarms:{create:()=>{},onAlarm:{addListener:f=>{alarm=f;}}},runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:()=>{}}},tabs:{create:async p=>created.push(p)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/worker'),'utf8'),{chrome,AbortSignal,fetch:async(url,options)=>{
  if(url.includes('/claim?')){assert.equal(options.method,'POST');return {ok:true};}
  assert.equal(options.headers['X-Oj-Helper-Gym'],'1');
  return {ok:true,json:async()=>({key:'27121:'+ 'a'.repeat(48),contest:'1',problem:'A',section})};
 }});
 await new Promise(r=>setImmediate(r));assert.equal(created.length,1);assert.equal(created[0].active,false);assert.equal(created[0].url,'https://codeforces.com/'+(section||'contest')+'/1/my#cfhelper=27121:'+'a'.repeat(48));assert.equal(typeof alarm,'function');
});
test('未确认的任务可重领，浏览器确认和网页领取各自只生效一次',async()=>{
 const {setTimeout:delay}=require('node:timers/promises');
 let received=0;
 const server=createBridge({secret:'paired',token:'task',job:{contest:'1',problem:'A',source:'int main(){}'},onEvent:()=>{},onReceive:()=>received++});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const pending=()=>fetch(base+'/pending',{headers:{Authorization:'Bearer paired','X-Oj-Helper-Receipt':'1'}}).then(response=>response.json());
 const claim=token=>fetch(base+'/claim?token='+token,{method:'POST'});
 try{
  assert.equal((await claim('task')).status,404);
  const first=await pending();
  assert.equal(first.key,'27121:task');
  assert.deepEqual(await pending(),{});
  await delay(730);
  assert.deepEqual(await pending(),first);
  assert.equal((await claim('bad')).status,403);
  assert.equal((await claim('task')).status,200);
  assert.equal((await claim('task')).status,200);
  assert.equal(received,1);
  assert.deepEqual(await pending(),{});
  assert.equal((await fetch(base+'/job?token=task').then(response=>response.json())).source,'int main(){}');
  assert.equal((await fetch(base+'/job?token=task')).status,404);
  assert.equal(received,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('旧扩展不会领走比赛模式任务，新扩展收到比赛显示设置',async()=>{
 const server=createBridge({secret:'paired',token:'task',job:{oj:'cf',contest:'42',problem:'A',verdictMode:'contest'},onEvent:()=>{}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer paired','X-Oj-Helper-Platforms':'cf,qoj'};
 try{
  assert.deepEqual(await fetch(base+'/pending',{headers}).then(response=>response.json()),{});
  const task=await fetch(base+'/pending',{headers:{...headers,'X-Oj-Helper-Contest-Mode':'1'}}).then(response=>response.json());assert.equal(task.problem,'A');
  assert.equal((await fetch(base+'/job?token=task').then(response=>response.json())).verdictMode,'contest');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
