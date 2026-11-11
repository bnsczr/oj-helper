const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {wakeAddress,createWakeListener,notifyBrowser,notifyUntilReceived}=require('./wakeup');
const {createBridge}=require('./bridge');
const {encode}=require('./native-host');

test('本机即时通知验证配对信息，连接缺失或无响应时限时回退',async()=>{
 const secret=crypto.randomBytes(32).toString('hex');let count=0;
 const address=wakeAddress(secret),server=createWakeListener(secret,()=>count++);
 await once(server,'listening');
 try{
  assert.equal(await notifyBrowser('wrong',{address}),false);assert.equal(count,0);
  assert.equal(await notifyBrowser(secret),true);assert.equal(count,1);
  assert.equal(await notifyBrowser(secret),true);assert.equal(count,2);
 }finally{await new Promise(resolve=>server.close(resolve));}
 assert.equal(await notifyBrowser(secret),false);
 const sockets=new Set(),unresponsive=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
 unresponsive.listen(address);await once(unresponsive,'listening');
 try{assert.equal(await notifyBrowser(secret,{timeout:30}),false);}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>unresponsive.close(resolve));}
});

async function exerciseNativeWatch(command,args,secret){
 const child=spawn(command,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const exited=once(child,'exit');let input=Buffer.alloc(0),messages=[],errors='';
 let changed=()=>{};child.stdout.on('data',chunk=>{
  input=Buffer.concat([input,chunk]);
  while(input.length>=4&&input.length>=input.readUInt32LE()+4){const length=input.readUInt32LE();messages.push(JSON.parse(input.subarray(4,length+4).toString('utf8')));input=input.subarray(length+4);}
  changed();
 });
 child.stderr.on('data',chunk=>errors+=chunk);child.stdin.on('error',()=>{});
 const waitFor=predicate=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('等待本机通知超时：'+JSON.stringify(messages)+' '+errors)),4000);
  changed=()=>{if(predicate()){clearTimeout(timer);resolve();}};changed();
 });
 try{
  const frame=encode({action:'watch',secret});child.stdin.write(frame.subarray(0,2));child.stdin.write(frame.subarray(2));
  await waitFor(()=>messages.some(message=>message.event==='ready'));
  for(let index=1;index<=2;index++){
   assert.equal(await notifyBrowser(secret),true);
   await waitFor(()=>messages.filter(message=>message.event==='bridge-ready').length===index);
  }
  child.stdin.end();
  const timer=setTimeout(()=>child.kill(),4000);
  const [code]=await exited;clearTimeout(timer);assert.equal(code,0,errors);
  assert.equal(await notifyBrowser(secret),false,'浏览器端口关闭后应释放通知连接');
 }finally{child.kill();child.stdin.destroy();}
}

test('持续本机连接支持多次即时通知，浏览器断开后退出且释放管道',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-watch-')),secretFile=path.join(directory,'secret'),script=path.join(directory,'native-host.js'),secret=crypto.randomBytes(32).toString('hex');
 try{
  await fs.writeFile(secretFile,secret);
  await fs.writeFile(script,'require('+JSON.stringify(require.resolve('./native-host'))+').run('+JSON.stringify({secretFile})+');');
  await exerciseNativeWatch(process.execPath,[script],secret);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('真实无窗口启动器持续转发通知，关闭浏览器输入即可清理助手',async t=>{
 const installed=path.join(__dirname,'.native-host','launcher-v5.exe');
 if(process.platform!=='win32'||!sync.existsSync(installed))return t.skip('未编译 Windows v5 启动器');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-watch-launcher-')),secretFile=path.join(directory,'secret'),secret=crypto.randomBytes(32).toString('hex');
 try{
  const native=path.join(directory,'.native-host');await fs.mkdir(native);
  const launcher=path.join(native,'launcher.exe');await fs.copyFile(installed,launcher);await fs.writeFile(path.join(native,'node-path.txt'),process.execPath);
  await fs.writeFile(secretFile,secret);await fs.writeFile(path.join(directory,'native-host.js'),'require('+JSON.stringify(require.resolve('./native-host'))+').run('+JSON.stringify({secretFile})+');');
  await exerciseNativeWatch(launcher,[],secret);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('扩展由本机通知立即领取任务，不等待 alarm；断连自动重连',async()=>{
 const ports=[],created=[],handlers={},retry=[];let secret='paired',pending=false;
 const chrome={storage:{local:{get:async()=>({bridgeSecret:secret})},onChanged:{addListener:fn=>handlers.storage=fn}},alarms:{create:()=>{},onAlarm:{addListener:fn=>handlers.alarm=fn}},runtime:{onStartup:{addListener:fn=>handlers.start=fn},onInstalled:{addListener:()=>{}},onMessage:{addListener:()=>{}},connectNative:name=>{
  assert.equal(name,'com.codeforces_helper.local');const callbacks={},sent=[];
  const port={sent,onMessage:{addListener:fn=>callbacks.message=fn},onDisconnect:{addListener:fn=>callbacks.disconnect=fn},postMessage:message=>sent.push(message),disconnect:()=>callbacks.disconnect(),receive:message=>callbacks.message(message)};ports.push(port);return port;
 }},tabs:{create:async options=>created.push(options)}};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 vm.runInNewContext(sync.readFileSync(require.resolve('./extension/worker'),'utf8'),{chrome,AbortSignal,
  setTimeout:(fn,ms)=>{retry.push({fn,ms});return retry.length;},clearTimeout:()=>{},
  fetch:async()=>({ok:true,json:async()=>pending?(pending=false,{key:'27121:'+'a'.repeat(48),contest:'1',problem:'A'}):{}})});
 await flush();assert.equal(ports.length,1);assert.equal(ports[0].sent[0].action,'watch');assert.equal(ports[0].sent[0].secret,'paired');assert.equal(created.length,0);
 pending=true;ports[0].receive({event:'bridge-ready'});await flush();assert.equal(created.length,1);assert.equal(created[0].active,false);
 ports[0].receive({event:'bridge-ready'});await flush();assert.equal(created.length,1,'同一任务不能被通知重复提交');
 ports[0].disconnect();assert.equal(retry[0].ms,200);retry[0].fn();await flush();assert.equal(ports.length,2);
 secret='new-secret';handlers.storage({bridgeSecret:{newValue:secret}},'local');await flush();assert.equal(ports.length,3);assert.equal(ports[2].sent[0].secret,secret);
});

test('本机连接短暂未就绪时，重试到扩展确认仍在 3 秒内',async()=>{
 const secret=crypto.randomBytes(32).toString('hex'),token='a'.repeat(48),receipt=new AbortController();
 const tabs=[],browserRequests=[];let ready=false;
 const bridge=createBridge({secret,token,job:{oj:'cf',contest:'42',problem:'A'},onEvent:()=>{},onReceive:()=>receipt.abort()});
 await new Promise(resolve=>bridge.listen(0,'127.0.0.1',resolve));
 const chrome={storage:{local:{get:async()=>({bridgeSecret:secret})}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},
  runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:()=>{}}},tabs:{create:async options=>tabs.push(options)}};
 const browser=vm.createContext({chrome,AbortSignal,fetch:(url,options)=>{
  if(!ready)return Promise.resolve({ok:false});
  browserRequests.push(url);
  return fetch(url.replace(':27121',':'+bridge.address().port),options);
 }});
 vm.runInContext(sync.readFileSync(require.resolve('./extension/worker'),'utf8'),browser);
 // The initial poll represents an already running extension with no job yet.
 await new Promise(resolve=>setImmediate(resolve));
 ready=true;
 let native;
 const connect=setTimeout(()=>{native=createWakeListener(secret,()=>{void browser.poll();});},400);
 const started=performance.now();
 try{
  await notifyUntilReceived(secret,receipt.signal);
  assert.equal(receipt.signal.aborted,true);
  assert.ok(native,'确认必须来自本机连接恢复后的通知');
  assert.ok(performance.now()-started<3000);
  for(let attempt=0;attempt<20&&!tabs.length;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(tabs.length,1);
  assert.equal(browserRequests.filter(url=>url.includes('/claim?')).length,1);
 }finally{
  clearTimeout(connect);
  if(native)await new Promise(resolve=>native.close(resolve));
  bridge.closeAllConnections();await new Promise(resolve=>bridge.close(resolve));
 }
});
