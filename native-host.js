
'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {createProblemFile,createContestFiles,contestStatement}=require('./files-server');
const {normalizeOpenSettings}=require('./extension/open-settings');
const {dashboardFromUrl}=require('./extension/problem');
const {parseProblem,readPreferences,updatePreferences,profileFor,profilePatch,withStateLock,preferencesFile,verdictModeFor,recoverContestSubmissions}=require('./preferences');
const {saveStatement}=require('./open');
const {openInVSCode}=require('./editor');
function encode(message){const body=Buffer.from(JSON.stringify(message),'utf8'),head=Buffer.alloc(4);head.writeUInt32LE(body.length);return Buffer.concat([head,body]);}
async function finishAddition(result,message,openEditor){
 // Old clients retain their original behavior until the extension is updated.
 if(message.openAfterAdd===undefined)return result;
 const settings=normalizeOpenSettings(message.openAfterAdd),dashboard=Array.isArray(result.files);
 const files=dashboard?result.files:[result],targets=[];
 const warnings=[...(result.warnings||[])];
 if(result.mappingOnly){
  if(!settings.contestCpp)return result;
  for(const {path:file} of files){
   try{
    await fs.promises.writeFile(file,'',{flag:'wx'}).catch(async error=>{
     if(error.code!=='EEXIST')throw error;
     if(!(await fs.promises.lstat(file)).isFile())throw Error('同名路径不是普通文件。');
    });
    targets.push(file);
   }catch(error){warnings.push('无法准备 '+path.basename(file)+'：'+error.message);}
  }
 }else if(dashboard?settings.dashboardCpp:settings.problemCpp){
  targets.push(...files.map(file=>file.path));
 }
 if(!result.mappingOnly&&(dashboard?settings.dashboardStatement:settings.problemStatement)){
  try{
   const added=result.oj==='qoj'?result.addition:dashboard?{...dashboardFromUrl(message.url),kind:'contest',directory:message.directory,statement:contestStatement(dashboardFromUrl(message.url),message.problems)}:{kind:'problem',contest:parseProblem(result.defaultProblem).contest,directory:message.directory,statement:message.statement};
   result.statementPath=await saveStatement(result.oj==='qoj'?{activeOj:'qoj',qoj:{lastAddition:added}}:{lastAddition:added});targets.push(result.statementPath);
  }catch(error){warnings.push('题面自动保存失败：'+error.message);}
 }
 if(targets.length){
  try{await openEditor(targets);result.openedFiles=targets;}
  catch(error){warnings.push('文件已创建，自动打开失败：'+error.message);}
 }
 if(warnings.length)result.warnings=warnings;
 return result;
}
async function prepareImport(message,stateFile){
 if(message.earlyMapping!==true&&verdictModeFor(readPreferences(stateFile))!=='contest')return {mappingOnly:false};
 const {url,directory,problems,oj,startedAt,recoverSession}=message,options={importId:randomUUID(),earlyMapping:message.earlyMapping===true,recoverSession};
 if(problems&&Number.isSafeInteger(startedAt)&&startedAt>0&&startedAt<=Date.now())options.startedAt=startedAt;
 if(oj==='qoj'){
  const draft=problem=>({url:problem.url,index:problem.index,title:problem.title,statement:'# 题面待读取'});
  const result=await require('./qoj-files').createQojFiles(problems?{action:'qoj-create-dashboard',directory,url,problems:problems.map(draft)}:{action:'qoj-create',directory,problem:draft({url,title:message.title})},stateFile,options);
  delete result.addition;return result;
 }
 return problems?createContestFiles(directory,url,problems,stateFile,undefined,options):createProblemFile(directory,url,stateFile,undefined,[],undefined,options);
}
async function cacheImport({oj,importId,statement,contests},stateFile=preferencesFile){
 if(!importId||typeof statement!=='string'||!statement.trim())throw Error('题面缓存参数无效。');
 return withStateLock(stateFile,()=>{
  const state=readPreferences(stateFile),added=profileFor(state,oj).lastAddition;
  if(added?.importId!==importId)throw Error('已有更新的导入记录，未替换题面缓存。');
  const patch={...added,statement};
  if(oj==='qoj'&&Array.isArray(contests))patch.contests=contests.filter(id=>/^[1-9]\d*$/.test(id));
  updatePreferences(profilePatch(state,{lastAddition:patch},oj),stateFile);
  return {cached:true};
 });
}
async function convertImportPdf({base64,url}){
 if(typeof base64!=='string'||base64.length>24*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('PDF 数据无效或过大。');
 const source=new URL(url);
 if(source.protocol!=='https:'||!['codeforces.com','www.codeforces.com','qoj.ac'].includes(source.host)||source.username||source.password)throw Error('PDF 链接无效。');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length>16*1024*1024||!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('题面响应不是 PDF。');
 const {pages}=await require('./qoj-pdf').pdfToMarkdown(bytes,{renderImages:false});
 const samples=pages.flatMap(page=>page.samples);
 const statement='[PDF 题面原件]('+source.href.replace(/[()]/g,c=>c==='('? '%28':'%29')+')\n\n'+pages.map((page,i)=>'### 第 '+(i+1)+' 页\n\n'+(page.text||'此页没有可提取的文字，请查看原件。')).join('\n\n');
 const result={statement:statement+require('./qoj-files').sampleMarkdown(samples),samples,complete:pages.some(page=>page.text)};
 if(Buffer.byteLength(JSON.stringify(result))>950000)throw Error('PDF 转换结果超过消息上限。');
 return result;
}
async function handle(message,{secretFile=path.join(__dirname,'.bridge-secret'),stateFile,openEditor=openInVSCode}={}){
 try{
  const secret=fs.readFileSync(secretFile,'utf8').trim();
  if(!secret||message.secret!==secret)throw Error('配对码不匹配，请重新配对。');
  if(message.action==='prepare-import'){
   const result=await prepareImport(message,stateFile);
   return result.mappingOnly?await finishAddition(result,message,openEditor):result;
  }
  if(message.action==='cache-import')return await cacheImport(message,stateFile);
  if(message.action==='recover-contest-submissions')return await recoverContestSubmissions(message,stateFile);
  if(message.action==='pdf-statement')return await convertImportPdf(message);
  if(message.action==='qoj-import-statement'){
   const {prepareProblem,sampleMarkdown}=require('./qoj-files');
   const problem=prepareProblem(message.problem);
   const pdf=problem.pdf?await convertImportPdf(message.problem.pdf):null;
   const result={statement:problem.statement+(pdf?'\n\n'+pdf.statement:'')+sampleMarkdown(problem.samples),complete:!pdf||pdf.complete,contests:problem.contests,warnings:problem.warnings};
   if(Buffer.byteLength(JSON.stringify(result))>950000)throw Error('题面转换结果超过消息上限。');
   return result;
  }
  const options={finishId:message.finishId};
  if(['qoj-create','qoj-create-dashboard'].includes(message.action)){const result=await finishAddition(await require('./qoj-files').createQojFiles(message,stateFile,options),message,openEditor);delete result.addition;return result;}
  if(message.action==='create-dashboard')return await finishAddition(await createContestFiles(message.directory,message.url,message.problems,stateFile,message.initialContent,options),message,openEditor);
  if(message.action!=='create')throw Error('未知操作');
  return await finishAddition(await createProblemFile(message.directory,message.url,stateFile,message.initialContent,message.samples,message.statement,options),message,openEditor);
 }catch(e){return {error:e.message};}
}
function run(options){
 let input=Buffer.alloc(0),done=false;
 process.stdin.on('data',chunk=>{
  if(done)return;input=Buffer.concat([input,chunk]);if(input.length<4)return;
  const length=input.readUInt32LE();
  if(length>64*1024*1024){done=true;process.stdout.write(encode({error:'请求过大'}),()=>process.exit(1));return;}
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
