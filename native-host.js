
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createProblemFile,createContestFiles,contestStatement}=require('./files-server');
const {normalizeOpenSettings}=require('./extension/open-settings');
const {dashboardFromUrl}=require('./extension/problem');
const {parseProblem}=require('./preferences');
const {saveStatement}=require('./open');
const {openInVSCode}=require('./editor');
function encode(message){const body=Buffer.from(JSON.stringify(message),'utf8'),head=Buffer.alloc(4);head.writeUInt32LE(body.length);return Buffer.concat([head,body]);}
async function finishAddition(result,message,openEditor){
 // Old clients retain their original behavior until the extension is updated.
 if(message.openAfterAdd===undefined)return result;
 const settings=normalizeOpenSettings(message.openAfterAdd),dashboard=message.action==='create-dashboard';
 const targets=(dashboard?settings.dashboardCpp:settings.problemCpp)?(dashboard?result.files.map(file=>file.path):[result.path]):[];
 const warnings=[];
 if(dashboard?settings.dashboardStatement:settings.problemStatement){
  try{
   const added=dashboard?{...dashboardFromUrl(message.url),kind:'contest',directory:message.directory,statement:contestStatement(dashboardFromUrl(message.url),message.problems)}:{kind:'problem',contest:parseProblem(result.defaultProblem).contest,directory:message.directory,statement:message.statement};
   result.statementPath=await saveStatement({lastAddition:added});targets.push(result.statementPath);
  }catch(error){warnings.push('题面自动保存失败：'+error.message);}
 }
 if(targets.length){
  try{await openEditor(targets);result.openedFiles=targets;}
  catch(error){warnings.push('文件已创建，自动打开失败：'+error.message);}
 }
 if(warnings.length)result.warnings=warnings;
 return result;
}
async function handle(message,{secretFile=path.join(__dirname,'.bridge-secret'),stateFile,openEditor=openInVSCode}={}){
 try{
  const secret=fs.readFileSync(secretFile,'utf8').trim();
  if(!secret||message.secret!==secret)throw Error('配对码不匹配，请重新配对。');
  if(message.action==='create-dashboard')return await finishAddition(await createContestFiles(message.directory,message.url,message.problems,stateFile,message.initialContent),message,openEditor);
  if(message.action!=='create')throw Error('未知操作');
  return await finishAddition(await createProblemFile(message.directory,message.url,stateFile,message.initialContent,message.samples,message.statement),message,openEditor);
 }catch(e){return {error:e.message};}
}
function run(options){
 let input=Buffer.alloc(0),done=false;
 process.stdin.on('data',chunk=>{
  if(done)return;input=Buffer.concat([input,chunk]);if(input.length<4)return;
  const length=input.readUInt32LE();
  if(length>1048576){done=true;process.stdout.write(encode({error:'请求过大'}),()=>process.exit(1));return;}
  if(input.length<length+4)return;done=true;
  (async()=>{let response;try{
   const message=JSON.parse(input.subarray(4,length+4).toString('utf8'));
   if(message.action==='watch'){
    const secret=fs.readFileSync(options?.secretFile||path.join(__dirname,'.bridge-secret'),'utf8').trim();
    if(!secret||message.secret!==secret)throw Error('配对码不匹配，请重新配对。');
    const {createWakeListener}=require('./wakeup');
    const notify=event=>process.stdout.write(encode({event}));
    const server=createWakeListener(secret,()=>notify('bridge-ready'));
    let stopped=false;
    const stop=()=>{if(stopped)return;stopped=true;server.close(()=>process.exit(0));};
    process.stdin.on('end',stop);process.stdout.on('error',stop);
    server.on('error',error=>process.stdout.write(encode({error:error.message}),()=>process.exit(1)));
    server.on('listening',()=>notify('ready'));return;
   }
   response=await handle(message,options);
  }catch(error){response={error:error.message||'请求格式错误'};}
   process.stdout.write(encode(response),()=>process.exit(0));})();
 });
}
if(require.main===module)run();
module.exports={handle,encode,run};
