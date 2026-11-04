'use strict';
const http=require('node:http');
function createBridge({secret,token,job,onEvent,onAnnounce=()=>{}}) {
  let announced=false,claimed=false,done=false;
  return http.createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    const u=new URL(req.url,'http://127.0.0.1');
    const send=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
    if(req.method==='GET'&&u.pathname==='/pending'){
      if(req.headers.authorization!==`Bearer ${secret}`)return send(403,{});
      if(job.oj==='qoj'&&!String(req.headers['x-oj-helper-platforms']||'cf').split(',').includes('qoj'))return send(200,{});
      if(announced||done)return send(200,{});
      announced=true;onAnnounce();return send(200,{key:`27121:${token}`,oj:job.oj,action:job.action,section:job.section,contest:job.contest,problem:job.problem});
    }
    if(req.method==='GET'&&u.pathname==='/health')return req.headers.authorization===`Bearer ${secret}`?send(200,{ready:true,announced,claimed,done}):send(403,{});
    if(u.searchParams.get('token')!==token)return send(403,{});
    if(req.method==='GET'&&u.pathname==='/job'&&!claimed&&!done){claimed=true;return send(200,job);}
    if(req.method==='POST'&&u.pathname==='/result'&&!done){
      const limit=job.action==='qoj-audit'?64*1024*1024:['open-standings','qoj-inspect'].includes(job.action)?8*1024*1024:10000;
      const chunks=[];let size=0,oversized=false;
      req.on('data',chunk=>{if(oversized)return;size+=chunk.length;if(size>limit){oversized=true;chunks.length=0;send(413,{error:'结果内容过大'});return;}chunks.push(chunk);});
      req.on('end',()=>{if(oversized)return;let event;try{event=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof event.message!=='string')throw Error();}catch{return send(400,{});}if(event.final===true)done=true;send(200,{});onEvent(event);});return;
    }
    send(404,{});
  });
}
module.exports={createBridge};
