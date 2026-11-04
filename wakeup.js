'use strict';
const net=require('node:net'),crypto=require('node:crypto'),path=require('node:path'),os=require('node:os');
function wakeAddress(secret){
 const id=crypto.createHash('sha256').update(secret).digest('hex').slice(0,32);
 return process.platform==='win32'?'\\\\.\\pipe\\cfhelper-wake-'+id:path.join(os.tmpdir(),'cfhelper-wake-'+id+'.sock');
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
module.exports={wakeAddress,createWakeListener,notifyBrowser};
