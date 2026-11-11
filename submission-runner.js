'use strict';
const {fork}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {createBridge}=require('./bridge');
const {notifyUntilReceived}=require('./wakeup');
const {recordSubmission,preferencesFile}=require('./preferences');
const {problemLabel,readResult,readSubmissionId}=require('./terminal-ui');
const {contestReport}=require('./extension/verdict');

async function startSubmission({job,context,secret,token,stateFile=preferencesFile,port=27121,timeout=600000},emit){
 const receipt=new AbortController();
 const deadline=Date.now()+timeout;
 let received=false,posting=false,interrupted=false,closed=false,finalizing=false,id,timer,reminder,postedAt,submittedAt,judgedSummary;
 let records=Promise.resolve();
 const save=result=>{
  records=records.then(()=>recordSubmission(context,result.id,result,stateFile))
   .catch(error=>emit({type:'notice',message:'提交记录保存失败：'+error.message}));
 };
 const submission=()=>({id,submittedAt,problem:problemLabel(job),file:job.fileName});
 const entry=state=>({...submission(),state,verdict:state==='pending'?'pending':'UNKNOW',monitorPid:process.pid,deadline});
 const saveVerdict=(result,{rawVerdict,measurements})=>{
  id=result.id;
  submittedAt??=postedAt??Date.now();
  const {verdict,time=measurements?.time,memory=measurements?.memory,score=measurements?.score}=result;
  save({...submission(),state:'final',verdict,rawVerdict,time,memory,score,solved:contestReport(verdict,{qoj:job.oj==='qoj'}).label==='CORRECT'});
 };
 const stop=async code=>{
  if(closed)return;
  closed=true;receipt.abort();clearTimeout(timer);clearTimeout(reminder);
  await records;
  await new Promise(resolve=>{
   const force=setTimeout(()=>server.closeAllConnections(),5000);force.unref();
   server.close(()=>{clearTimeout(force);resolve();});
   server.closeIdleConnections();
  });
  emit({type:'done',code});
 };
 const finish=async event=>{
  if(finalizing)return;
  finalizing=true;clearTimeout(timer);clearTimeout(reminder);
  const result=event.ok&&readResult(event.message);
  if(result)saveVerdict(result,event);
  else if(judgedSummary){
   const label=job.oj==='qoj'?'最后普通测试点 checker':'最后测试点 checker';
   event={...event,ok:true,message:judgedSummary+' | '+label+'：无法得知结果'};
  }else if(id)save(entry('unknown'));
  await records;
  emit({type:'event',event});
  await stop(event.ok?0:1);
 };
 const server=createBridge({secret,token,job,
  isCancelled:()=>interrupted&&!posting,
  beforeSubmit:()=>{if(interrupted&&!posting)return false;posting=true;postedAt??=Date.now();return true;},
  onReceive:()=>{received=true;receipt.abort();clearTimeout(reminder);emit({type:'status',message:'浏览器已领取，正在打开提交页'});},
  onEvent:event=>{
   if(finalizing||closed)return;
   clearTimeout(reminder);
   const number=readSubmissionId(event.message)||(/^[1-9]\d*$/.test(String(event.submissionId))?String(event.submissionId):undefined);
   if(Number.isSafeInteger(event.submittedAt)&&event.submittedAt>0&&event.submittedAt<=Date.now())submittedAt=event.submittedAt;
   if(number&&number!==id){id=number;submittedAt??=postedAt??Date.now();save(entry('pending'));}
   if(event.final){void finish(event);return;}
   if(event.phase==='judged'&&job.verdictMode!=='contest'){
    const result=readResult(event.message);
    if(result&&event.message!==judgedSummary){
     judgedSummary=event.message;
     saveVerdict(result,event);
    }
   }
   emit({type:'event',event});
   if(event.phase==='judged')return records;
  }
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 }catch(error){
  if(error.code==='EADDRINUSE')throw Error('已有提交正在运行或 27121 端口被占用，请等待完成后重试。');
  throw error;
 }
 emit({type:'ready',port:server.address().port});
 emit({type:'status',message:'等待浏览器领取'});
 reminder=setTimeout(()=>emit({type:'notice',message:'请确认浏览器正在运行，扩展已配对。配对命令为 submit --pair。'}),45000);
 timer=setTimeout(()=>void finish({message:'等待超时，结果未知。请先核对网站提交记录，避免重复提交。',final:true,ok:false}),timeout);
 void notifyUntilReceived(secret,receipt.signal).catch(error=>emit({type:'notice',message:'通知浏览器失败：'+error.message}));
 return {
  interrupt(){
   if(closed||finalizing)return;
   interrupted=true;
   if(posting||id)return;
   receipt.abort();clearTimeout(reminder);
   if(!received){void finish({message:'提交已取消。',final:true,ok:false});return;}
   // Let an already-open form receive the cancellation before retiring its bridge.
   clearTimeout(timer);
   timer=setTimeout(()=>void finish({message:'提交已取消。',final:true,ok:false}),30000);
  }
 };
}

function runSubmission(options,view){
 return new Promise((resolve,reject)=>{
  const monitor=fork(__filename,[],{detached:true,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  let ended=false;
  const release=()=>{process.removeListener('SIGINT',interrupt);if(monitor.connected)monitor.disconnect();monitor.unref();};
  const interrupt=()=>{
   if(ended)return;
   ended=true;
   view.notice('已停止终端等待。已发出的提交会继续跟踪，可用 submit status 查看。');
   // Closing IPC also notifies the monitor if the parent is killed abruptly.
   release();resolve(130);
  };
  process.on('SIGINT',interrupt);
  monitor.on('error',error=>{if(ended)return;ended=true;release();reject(error);});
  monitor.on('exit',code=>{
   if(ended)return;
   ended=true;release();reject(Error('后台评测进程意外退出（'+code+'），请使用 submit status 查看记录。'));
  });
  monitor.on('message',message=>{
   if(ended)return;
   if(message.type==='event')view.event(message.event);
   if(['status','notice','failure'].includes(message.type))view[message.type](message.message);
   if(message.type==='done'){ended=true;release();resolve(message.code);}
  });
  monitor.send({type:'start',...options,token:randomBytes(24).toString('hex')},error=>{
   if(error&&!ended){ended=true;release();reject(error);}
  });
 });
}

if(require.main===module){
 let runner,disconnected=false;
 const emit=message=>{
  if(process.connected)process.send(message,()=>{});
  if(message.type==='done'&&process.connected)process.disconnect();
 };
 process.on('disconnect',()=>{disconnected=true;runner?.interrupt();});
 process.once('message',async options=>{
  try{runner=await startSubmission(options,emit);if(disconnected)runner.interrupt();}
  catch(error){emit({type:'failure',message:error.message});emit({type:'done',code:1});}
 });
}
module.exports={startSubmission,runSubmission};
