'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {problemFromUrl,dashboardFromUrl}=require('./extension/problem');
const {appendSamples}=require('./samples');
const {DEFAULT_INITIAL_CONTENT}=require('./extension/template');
const {parseProblem,readPreferences,updatePreferences,preferencesFile,fileKey,sequenceName,withStateLock}=require('./preferences');
function contestStatement(dashboard,problems){
 return problems.every(problem=>typeof problem.statement==='string')?'# Codeforces '+dashboard.contest+'\n\n[比赛链接]('+dashboard.url+')\n\n'+problems.map(problem=>problem.statement).join('\n\n---\n\n'):null;
}
async function createProblemFile(directory,url,stateFile=preferencesFile,initialContent=DEFAULT_INITIAL_CONTENT,samples=[],statement){
 if(statement!==undefined&&(typeof statement!=='string'||!statement.trim()))throw Error('题面内容无效，请重新添加。');
 if(typeof initialContent!=='string')throw Error('初始内容必须是文本。');
 const content=appendSamples(initialContent,samples);
 const problem=problemFromUrl(url).replace(/\.cpp$/,'');
 parseProblem(problem);
 if(typeof directory!=='string'||!directory.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');
 if(!path.isAbsolute(directory))throw Error('保存目录必须是绝对路径，例如 E:\\code\\CF。');
 let info;try{info=await fs.stat(directory);}catch(e){if(e.code==='ENOENT')throw Error('保存目录不存在，请先创建目录或修改设置。');throw e;}
 if(!info.isDirectory())throw Error('保存路径不是文件夹。');
 return withStateLock(stateFile,async()=>{
  const state=readPreferences(stateFile),directoryKey=fileKey(directory);
  const assignment=state.assignments?.[directoryKey]||{next:0,problems:{}};
  const known=assignment.problems[problem];
  let next=assignment.next;while(!known&&Object.values(assignment.problems).includes(sequenceName(next)))next++;
  const name=known||sequenceName(next);
  const target=path.join(directory,name);let existed=false;
  try{const info=await fs.lstat(target);if(!info.isFile())throw Error('同名路径已存在，但不是普通文件。');existed=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.writeFile(target,content,'utf8');
  updatePreferences({lastAddition:{kind:'problem',contest:parseProblem(problem).contest,section:new URL(url).pathname.startsWith('/gym/')?'gym':'contest',url,directory,statement:statement||null},defaultProblem:problem,fileProblems:{...state.fileProblems,[fileKey(target)]:problem},assignments:{...state.assignments,[directoryKey]:{next:known?assignment.next:next+1,problems:{...assignment.problems,[problem]:name}}}},stateFile);
  return {name,path:target,existed,defaultProblem:problem,sampleCount:samples.length};
 });
}
async function createContestFiles(directory,url,problems,stateFile=preferencesFile,initialContent=DEFAULT_INITIAL_CONTENT){
 const dashboard=dashboardFromUrl(url);
 if(!dashboard||!Array.isArray(problems)||!problems.length||typeof initialContent!=='string')throw Error('比赛批量创建参数无效。');
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('保存目录必须是绝对路径。');
 if(!(await fs.stat(directory)).isDirectory())throw Error('保存路径不是文件夹。');
 const indices=new Set();
 const prepared=problems.map(problem=>{
  if(!problem||! /^[A-Z]\d*$/.test(problem.index)||indices.has(problem.index)||!Array.isArray(problem.samples)||!problem.samples.length)throw Error('比赛题号重复或样例缺失，未覆盖文件。');
  indices.add(problem.index);
  if(problem.statement!==undefined&&(typeof problem.statement!=='string'||!problem.statement.trim()))throw Error('题面内容无效，请重新添加。');
  return {name:problem.index+'.cpp',path:path.join(directory,problem.index+'.cpp'),defaultProblem:dashboard.contest+problem.index,sampleCount:problem.samples.length,content:appendSamples(initialContent,problem.samples)};
 });
 return withStateLock(stateFile,async()=>{
  for(const file of prepared){try{if(!(await fs.lstat(file.path)).isFile())throw Error(file.name+' 不是普通文件，未覆盖文件。');file.existed=true;}catch(e){if(e.code!=='ENOENT')throw e;file.existed=false;}}
  const state=readPreferences(stateFile),fileProblems={...state.fileProblems},assigned={};
  for(const file of prepared){await fs.writeFile(file.path,file.content,'utf8');fileProblems[fileKey(file.path)]=file.defaultProblem;assigned[file.defaultProblem]=file.name;}
  let next=0;while(Object.values(assigned).includes(sequenceName(next)))next++;
  const statement=contestStatement(dashboard,problems);
  updatePreferences({lastAddition:{kind:'contest',contest:dashboard.contest,section:'contest',url:dashboard.url,directory,statement},defaultProblem:prepared.at(-1).defaultProblem,fileProblems,assignments:{...state.assignments,[fileKey(directory)]:{next,problems:assigned}}},stateFile);
  return {contest:dashboard.contest,files:prepared.map(({content,...file})=>file)};
 });
}
function createFilesServer(secret,stateFile=preferencesFile){return http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
 if(req.headers.authorization!==`Bearer ${secret}`)return send(403,{error:'配对码不匹配，请重新配对。'});
 if(req.method!=='POST'||req.url!=='/create')return send(404,{error:'未知操作'});
 let body='',oversized=false;req.on('data',chunk=>{if(oversized)return;body+=chunk;if(Buffer.byteLength(body)>1048576){oversized=true;send(413,{error:'请求过大'});}});
 req.on('end',async()=>{if(oversized)return;let data;try{data=JSON.parse(body);}catch{return send(400,{error:'请求格式错误'});}try{send(200,await createProblemFile(data.directory,data.url,stateFile,data.initialContent,data.samples,data.statement));}catch(e){send(400,{error:e.message});}});
});}
async function serveFiles(secret){const server=createFilesServer(secret);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(27122,'127.0.0.1',resolve);});console.log('浏览器新建文件助手已启动。保持此终端运行；Ctrl+C 停止。保存目录在浏览器扩展设置中填写，没有默认目录。');return server;}
module.exports={contestStatement,createContestFiles,createProblemFile,createFilesServer,serveFiles};
