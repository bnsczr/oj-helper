'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {problemFromUrl,dashboardFromUrl}=require('./extension/problem');
const {appendSamples}=require('./samples');
const {DEFAULT_INITIAL_CONTENT}=require('./extension/template');
const {parseProblem,cfProblemKey,readPreferences,updatePreferences,preferencesFile,fileKey,sequenceName,withStateLock,verdictModeFor,newContestBoard,profileFor,ojModeFor}=require('./preferences');
async function sourceVersion(file){
 try{
  const info=await fs.lstat(file,{bigint:true});
  if(!info.isFile())throw Error(path.basename(file)+' 不是普通文件，未覆盖。');
  return [info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
 }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function snapshotSources(files){
 return Object.fromEntries(await Promise.all(files.map(async file=>[file.name,await sourceVersion(file.path)])));
}
function pendingImport(state,oj,finishId,url,directory,kind){
 if(!finishId)return null;
 const addition=profileFor(state,oj).lastAddition;
 if(ojModeFor(state).id!==oj||verdictModeFor(state)==='contest'||addition?.importId!==finishId||!addition.sourceVersions||addition.url!==url||addition.directory!==directory||addition.kind!==kind){
  throw Error('导入记录已更新，未写入旧题面或源码。');
 }
 return addition;
}
async function writeImportedSource(file,content,addition){
 const previous=addition?.sourceVersions[file.name];
 if(addition&&(previous===undefined||await sourceVersion(file.path)!==previous))return false;
 try{
  await fs.writeFile(file.path,content,{encoding:'utf8',flag:addition&&previous===null?'wx':'w'});
 }catch(error){if(addition&&error.code==='EEXIST')return false;throw error;}
 return true;
}
function preservedSourceWarning(file){return file.name+' 在读取题面期间已变动，已保留现有源码。';}
function contestStatement(dashboard,problems){
 return problems.every(problem=>typeof problem.statement==='string')?'# Codeforces '+(dashboard.section==='gym'?'Gym ':'')+dashboard.contest+'\n\n[比赛链接]('+dashboard.url+')\n\n'+problems.map(problem=>problem.statement).join('\n\n---\n\n'):null;
}
async function createProblemFile(directory,url,stateFile=preferencesFile,initialContent=DEFAULT_INITIAL_CONTENT,samples=[],statement,{importId,finishId,earlyMapping}={}){
 if(statement!==undefined&&(typeof statement!=='string'||!statement.trim()))throw Error('题面内容无效，请重新添加。');
 if(typeof initialContent!=='string')throw Error('初始内容必须是文本。');
 const parsed=parseProblem(problemFromUrl(url).replace(/\.cpp$/,''));
 const section=/^\/gym\//i.test(new URL(url).pathname)?'gym':'contest';
 const problem=cfProblemKey({...parsed,section});
 if(typeof directory!=='string'||!directory.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');
 if(!path.isAbsolute(directory))throw Error('保存目录必须是绝对路径，例如 E:\\code\\CF。');
 let info;try{info=await fs.stat(directory);}catch(e){if(e.code==='ENOENT')throw Error('保存目录不存在，请先创建目录或修改设置。');throw e;}
 if(!info.isDirectory())throw Error('保存路径不是文件夹。');
 return withStateLock(stateFile,async()=>{
  const state=readPreferences(stateFile),directoryKey=fileKey(directory),plan=pendingImport(state,'cf',finishId,url,directory,'problem');
  const emptySource=!plan&&verdictModeFor(state)==='contest';
  if(importId&&!emptySource&&!earlyMapping)return {mappingOnly:false};
  if(!emptySource&&samples===null)throw Error('未读取到完整样例，请等待题目加载完成后重试。');
  const content=emptySource?'':appendSamples(initialContent,samples);
  const assignment=state.assignments?.[directoryKey]||{next:0,problems:{}};
  const known=assignment.problems[problem];
  let next=assignment.next;while(!emptySource&&!known&&Object.values(assignment.problems).includes(sequenceName(next)))next++;
  const name=emptySource?parsed.problem+'.cpp':known||sequenceName(next);
  const assigned=Object.fromEntries(Object.entries(assignment.problems).filter(([,file])=>file!==name));assigned[problem]=name;
  const target=path.join(directory,name),file={name,path:target,existed:false,defaultProblem:problem,sampleCount:0};
  const sourceVersions=importId&&!emptySource?await snapshotSources([file]):undefined;
  if(!emptySource&&!importId){
   file.existed=await sourceVersion(target)!==null;
   if(await writeImportedSource(file,content,plan))file.sampleCount=samples.length;
   else Object.assign(file,{sourcePreserved:true,warnings:[preservedSourceWarning(file)]});
  }
  const lastAddition={kind:'problem',contest:parsed.contest,section,url,directory,statement:statement||null,importId,sourceVersions};
  updatePreferences(plan?{lastAddition}:{activeOj:'cf',lastAddition,defaultProblem:problem,fileProblems:{...state.fileProblems,[fileKey(target)]:problem},assignments:{...state.assignments,[directoryKey]:{next:emptySource||known?assignment.next:next+1,problems:assigned}}},stateFile);
  return {...file,...(importId||emptySource?{mappingOnly:emptySource,importId}: {})};
 });
}
async function createContestFiles(directory,url,problems,stateFile=preferencesFile,initialContent=DEFAULT_INITIAL_CONTENT,{importId,finishId,earlyMapping,startedAt}={}){
 const dashboard=dashboardFromUrl(url);
 if(!dashboard||!Array.isArray(problems)||!problems.length||typeof initialContent!=='string')throw Error('比赛批量创建参数无效。');
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('保存目录必须是绝对路径。');
 if(!(await fs.stat(directory)).isDirectory())throw Error('保存路径不是文件夹。');
 return withStateLock(stateFile,async()=>{
  const state=readPreferences(stateFile),plan=pendingImport(state,'cf',finishId,dashboard.url,directory,'contest'),indices=new Set();
  const emptySource=!plan&&verdictModeFor(state)==='contest';
  if(importId&&!emptySource&&!earlyMapping)return {mappingOnly:false};
  const prepared=problems.map(problem=>{
   if(!problem||! /^[A-Z]\d*$/.test(problem.index)||indices.has(problem.index))throw Error('比赛题号无效或重复，未覆盖文件。');
   if(problem.statement!==undefined&&(typeof problem.statement!=='string'||!problem.statement.trim()))throw Error('题面内容无效，请重新添加。');
   if(!emptySource&&!importId&&(!Array.isArray(problem.samples)||!problem.samples.length&&!problem.statement))throw Error('比赛样例缺失，未覆盖文件。');
   indices.add(problem.index);
   return {name:problem.index+'.cpp',path:path.join(directory,problem.index+'.cpp'),defaultProblem:cfProblemKey({...dashboard,problem:problem.index}),sampleCount:emptySource||importId?0:problem.samples.length,content:emptySource||importId?'':appendSamples(initialContent,problem.samples)};
  });
  const sourceVersions=!emptySource?await snapshotSources(prepared):undefined;
  const fileProblems={...state.fileProblems},assigned={},warnings=[];
  for(const file of prepared){
   if(!emptySource&&!importId){
    file.existed=sourceVersions[file.name]!==null;
    if(!await writeImportedSource(file,file.content,plan)){file.sampleCount=0;warnings.push(preservedSourceWarning(file));}
   }
   fileProblems[fileKey(file.path)]=file.defaultProblem;assigned[file.defaultProblem]=file.name;
  }
  let next=0;while(Object.values(assigned).includes(sequenceName(next)))next++;
  const statement=contestStatement(dashboard,problems);
  const lastAddition={kind:'contest',...dashboard,directory,statement,importId:plan?.importId??importId,startedAt:plan?.startedAt??startedAt,sourceVersions:importId?sourceVersions:undefined};
  updatePreferences(plan?{lastAddition}:{activeOj:'cf',lastAddition,defaultProblem:prepared.at(-1).defaultProblem,fileProblems,contestBoard:newContestBoard(lastAddition,prepared.map(file=>({index:file.name.slice(0,-4),target:file.defaultProblem})),importId),assignments:{...state.assignments,[fileKey(directory)]:{next,problems:assigned}}},stateFile);
  return {contest:dashboard.contest,files:prepared.map(({content,...file})=>file),...(warnings.length?{warnings}:{}),...(importId||emptySource?{mappingOnly:emptySource,importId}: {})};
 });
}
function createFilesServer(secret,stateFile=preferencesFile){return http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
 if(req.headers.authorization!==`Bearer ${secret}`)return send(403,{error:'配对码不匹配，请重新配对。'});
 if(req.method!=='POST'||req.url!=='/create')return send(404,{error:'未知操作'});
 let body='',oversized=false;req.on('data',chunk=>{if(oversized)return;body+=chunk;if(Buffer.byteLength(body)>64*1024*1024){oversized=true;send(413,{error:'请求过大'});}});
 req.on('end',async()=>{if(oversized)return;let data;try{data=JSON.parse(body);}catch{return send(400,{error:'请求格式错误'});}try{send(200,data.oj==='qoj'?await require('./qoj-files').createQojFiles({...data,action:data.action||'qoj-create'},stateFile):await createProblemFile(data.directory,data.url,stateFile,data.initialContent,data.samples,data.statement));}catch(e){send(400,{error:e.message});}});
});}
async function serveFiles(secret){const server=createFilesServer(secret);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(27122,'127.0.0.1',resolve);});console.log('浏览器新建文件助手已启动。保持此终端运行；Ctrl+C 停止。保存目录在浏览器扩展设置中填写，没有默认目录。');return server;}
module.exports={contestStatement,createContestFiles,createProblemFile,createFilesServer,serveFiles,snapshotSources,pendingImport,writeImportedSource,preservedSourceWarning};
