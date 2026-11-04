const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {wakeAddress,createWakeListener,notifyBrowser}=require('./wakeup');
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
 const installed=path.join(__dirname,'.native-host','launcher-v4.exe');
 if(process.platform!=='win32'||!sync.existsSync(installed))return t.skip('未编译 Windows v4 启动器');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-watch-launcher-')),secretFile=path.join(directory,'secret'),secret=crypto.randomBytes(32).toString('hex');
 try{
  const native=path.join(directory,'.native-host');await fs.mkdir(native);
  const launcher=path.join(native,'launcher.exe');await fs.copyFile(installed,launcher);await fs.writeFile(path.join(native,'node-path.txt'),process.execPath);
  await fs.writeFile(secretFile,secret);await fs.writeFile(path.join(directory,'native-host.js'),'require('+JSON.stringify(require.resolve('./native-host'))+').run('+JSON.stringify({secretFile})+');');
  await exerciseNativeWatch(launcher,[],secret);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('扩展由本机通知立即领取任务，不等待 alarm；断连及重新配对后可恢复',async()=>{
 const ports=[],created=[],handlers={};let secret='paired',pending=false;
 const chrome={storage:{local:{get:async()=>({bridgeSecret:secret})},onChanged:{addListener:fn=>handlers.storage=fn}},alarms:{create:()=>{},onAlarm:{addListener:fn=>handlers.alarm=fn}},runtime:{onStartup:{addListener:fn=>handlers.start=fn},onInstalled:{addListener:()=>{}},onMessage:{addListener:()=>{}},connectNative:name=>{
  assert.equal(name,'com.codeforces_helper.local');const callbacks={},sent=[];
  const port={sent,onMessage:{addListener:fn=>callbacks.message=fn},onDisconnect:{addListener:fn=>callbacks.disconnect=fn},postMessage:message=>sent.push(message),disconnect:()=>callbacks.disconnect(),receive:message=>callbacks.message(message)};ports.push(port);return port;
 }},tabs:{create:async options=>created.push(options)}};
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 vm.runInNewContext(sync.readFileSync(require.resolve('./extension/worker'),'utf8'),{chrome,AbortSignal,fetch:async()=>({ok:true,json:async()=>pending?(pending=false,{key:'27121:'+'a'.repeat(48),contest:'1',problem:'A'}):{}})});
 await flush();assert.equal(ports.length,1);assert.equal(ports[0].sent[0].action,'watch');assert.equal(ports[0].sent[0].secret,'paired');assert.equal(created.length,0);
 pending=true;ports[0].receive({event:'bridge-ready'});await flush();assert.equal(created.length,1);assert.equal(created[0].active,false);
 ports[0].receive({event:'bridge-ready'});await flush();assert.equal(created.length,1,'同一任务不能被通知重复提交');
 ports[0].disconnect();handlers.start();await flush();assert.equal(ports.length,2);
 secret='new-secret';handlers.storage({bridgeSecret:{newValue:secret}},'local');await flush();assert.equal(ports.length,3);assert.equal(ports[2].sent[0].secret,secret);
});
