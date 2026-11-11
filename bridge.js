'use strict';
const http=require('node:http');
function createBridge({secret,token,job,onEvent,onAnnounce=()=>{},onReceive=()=>{},isCancelled=()=>false,beforeSubmit=()=>true}) {
  let announced=false,received=false,claimed=false,done=false,retryAt=0;
  const receive=()=>{if(!received){received=true;onReceive();}};
  return http.createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    const u=new URL(req.url,'http://127.0.0.1');
    const send=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
    if(req.method==='GET'&&u.pathname==='/pending'){
      if(req.headers.authorization!==`Bearer ${secret}`)return send(403,{});
      if(job.oj==='qoj'&&!String(req.headers['x-oj-helper-platforms']||'cf').split(',').includes('qoj'))return send(200,{});
      if(job.oj!=='qoj'&&job.section==='gym'&&!job.action&&req.headers['x-oj-helper-gym']!=='1')return send(200,{});
      if(job.verdictMode==='contest'&&req.headers['x-oj-helper-contest-mode']!=='1')return send(200,{});
      if(done||received||announced&&Date.now()<retryAt)return send(200,{});
      retryAt=!job.action&&req.headers['x-oj-helper-receipt']==='1'?Date.now()+700:Infinity;
      if(!announced){announced=true;onAnnounce();}
      return send(200,{key:`27121:${token}`,oj:job.oj,action:job.action,section:job.section,contest:job.contest,problem:job.problem});
    }
    if(req.method==='GET'&&u.pathname==='/health')return req.headers.authorization===`Bearer ${secret}`?send(200,{ready:true,announced,claimed,done}):send(403,{});
    if(u.searchParams.get('token')!==token)return send(403,{});
    if(req.method==='POST'&&u.pathname==='/claim'&&announced&&!done){receive();return send(200,{});}
    if(req.method==='GET'&&u.pathname==='/job'&&!claimed&&!done){claimed=true;receive();return send(200,isCancelled()?{cancelled:true}:job);}
    if(req.method==='POST'&&u.pathname==='/result'&&!done){
      const limit=job.action==='qoj-audit'?64*1024*1024:['open-standings','qoj-inspect'].includes(job.action)?8*1024*1024:10000;
      const chunks=[];let size=0,oversized=false;
      req.on('data',chunk=>{if(oversized)return;size+=chunk.length;if(size>limit){oversized=true;chunks.length=0;send(413,{error:'结果内容过大'});return;}chunks.push(chunk);});
      req.on('end',()=>{
        if(oversized)return;
        let event;
        try{event=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof event.message!=='string')throw Error();}catch{return send(400,{});}
        // This acknowledgement is the last gate before the browser clicks Submit.
        const submitting=event.phase==='submitting'||/^使用(?: QOJ )?编译器[：:].+。正在提交。$/.test(event.message);
        if(submitting&&!beforeSubmit())return send(200,{cancelled:true});
        if(event.final===true)done=true;
        if(event.phase==='judged'){
          void Promise.resolve().then(()=>onEvent(event)).then(()=>send(200,{}),()=>send(500,{}));
          return;
        }
        send(200,{});onEvent(event);
      });return;
    }
    send(404,{});
  });
}
module.exports={createBridge};
