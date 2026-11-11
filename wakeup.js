'use strict';
const net=require('node:net'),crypto=require('node:crypto'),path=require('node:path'),os=require('node:os');
const {setTimeout:delay}=require('node:timers/promises');
function wakeAddress(secret){
 const id=crypto.createHash('sha256').update(secret).digest('hex').slice(0,32);
 if(process.platform==='win32')return '\\\\.\\pipe\\cfhelper-wake-'+id;
 const [major,minor]=process.versions.node.split('.').map(Number);
 // Abstract Linux sockets disappear even if the browser kills the host.
 if(process.platform==='linux'&&(major>20||major===20&&minor>=8))return '\0cfhelper-wake-'+id;
 return path.join(os.tmpdir(),'cfhelper-wake-'+id+'.sock');
}
function createWakeListener(secret,onWake,{address=wakeAddress(secret)}={}){
 const server=net.createServer(socket=>{
  let input='',handled=false;
  socket.setTimeout(1000,()=>socket.destroy());socket.on('error',()=>{});
  socket.on('data',chunk=>{
   if(handled)return;
   input+=chunk.toString('utf8');if(input.length>1024){handled=true;socket.destroy();return;}
   if(!input.includes('\n'))return;handled=true;
   let message;try{message=JSON.parse(input.slice(0,input.indexOf('\n')));}catch{socket.destroy();return;}
   if(message.secret!==secret){socket.destroy();return;}
   onWake();socket.end('ok\n');
  });
 });
 server.listen(address);return server;
}
function notifyBrowser(secret,{address=wakeAddress(secret),timeout=350}={}){
 return new Promise(resolve=>{
  const socket=net.createConnection(address);let settled=false,input='';
  const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);socket.destroy();resolve(ok);};
  const timer=setTimeout(()=>finish(false),timeout);
  socket.on('connect',()=>socket.write(JSON.stringify({secret})+'\n'));
  socket.on('data',chunk=>{input+=chunk.toString('utf8');if(input.includes('\n'))finish(input==='ok\n');});
  socket.on('error',()=>finish(false));socket.on('end',()=>finish(false));
 });
}
async function notifyUntilReceived(secret,signal,{notify=notifyBrowser}={}){
 const start=performance.now(),deadline=start+3000;
 try{
  for(const offset of [0,300,700,1200,1800,2400]){
   const wait=start+offset-performance.now();
   if(wait>0)await delay(wait,undefined,{signal});
   const remaining=deadline-performance.now();
   if(signal.aborted||remaining<=0)return;
   await notify(secret,{timeout:Math.min(250,remaining)});
  }
  const remaining=deadline-performance.now();
  if(!signal.aborted&&remaining>0)await delay(remaining,undefined,{signal});
 }catch(error){if(!signal.aborted)throw error;}
}
module.exports={wakeAddress,createWakeListener,notifyBrowser,notifyUntilReceived};
