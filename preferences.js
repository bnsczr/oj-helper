
'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,randomInt}=require('node:crypto');
const {contestReport,isPenaltyVerdict}=require('./extension/verdict');
const preferencesFile=path.join(__dirname,'.submit-preferences.json');
const ojModes={cf:{id:'cf',name:'Codeforces',available:true},qoj:{id:'qoj',name:'QOJ',available:true}};
function ojModeFor(state={}){
 const id=String(state.activeOj??'cf').trim().toLowerCase(),mode=ojModes[id];
 if(!Object.hasOwn(ojModes,id))throw Error('不支持的 OJ，请使用 oj CF 或 oj qoj。');
 return mode;
}
async function selectOj(value,file=preferencesFile){
 const mode=ojModeFor({activeOj:value});
 await withStateLock(file,()=>updatePreferences({activeOj:mode.id},file));return mode;
}
function verdictModeFor(state={}){return state.verdictMode==='contest'?'contest':'normal';}
async function selectVerdictMode(value,file=preferencesFile){
 const mode=String(value).trim().toLowerCase();
 if(!['contest','normal'].includes(mode))throw Error('用法：mode contest、mode normal 或 mode status。');
 await withStateLock(file,()=>updatePreferences({verdictMode:mode},file));return mode;
}
function requireAvailableOj(state){
 const mode=ojModeFor(state);
 if(!mode.available)throw Error('当前为 '+mode.name+' 模式，功能暂未实现。请运行 oj CF 切回 Codeforces。');
 return mode;
}
function profileFor(state,oj=ojModeFor(state).id){return oj==='cf'?state:(state.qoj||{});}
function profilePatch(state,patch,oj){return oj==='cf'?patch:{qoj:{...state.qoj,...patch}};}
async function updateOjPreferences(patch,oj,file=preferencesFile,expectedVersion){
 return withStateLock(file,()=>{
  const state=readPreferences(file);
  if(expectedVersion!==undefined&&(state.submissionHistoryVersion||0)!==expectedVersion)return state;
  return updatePreferences(profilePatch(state,patch,oj),file);
 });
}
function parseProblem(value,oj='cf'){
 if(oj==='qoj')return require('./extension/qoj').qojTarget(value);
 const input=String(value).trim();
 const m=/^([1-9]\d*)([a-z]\d*)$/i.exec(input);
 if(m)return {contest:m[1],problem:m[2].toUpperCase()};
 const gym=/^https:\/\/(?:www\.)?codeforces\.com\/gym\/([1-9]\d*)\/problem\/([a-z]\d*)\/?(?:[?#].*)?$/i.exec(input);
 if(gym)return {contest:gym[1],problem:gym[2].toUpperCase(),section:'gym'};
 throw Error('请输入完整题号（例如 2278F）或 Gym 题目链接。');
}
function cfProblemKey({section,contest,problem}){
 return section==='gym'?'https://codeforces.com/gym/'+contest+'/problem/'+problem:contest+problem;
}
function readPreferences(file=preferencesFile){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('读取提交偏好失败：'+e.message);}
}
function updatePreferences(patch,file=preferencesFile){
 const previous=readPreferences(file);
 const state={...previous,...patch};
 if((previous.activeOj??'cf')!==(state.activeOj??'cf')){
  Object.assign(state,resetSubmissionHistory(previous));
 }
 return writePreferences(state,file);
}
function writePreferences(state,file){
 const temp=file+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return state;
}
function resetSubmissionHistory(state){
 return {submissionHistory:[],submissionHistoryVersion:(state.submissionHistoryVersion||0)+1};
}
function headerColor(rgb){
 const [red,green,blue]=rgb.map(channel=>{
  const value=channel/255;
  return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;
 });
 const luminance=red*0.2126+green*0.7152+blue*0.0722;
 const foreground=luminance>0.179?'30':'97';
 // Public-domain Oklab conversion by Björn Ottosson.
 // https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
 const l=Math.cbrt(0.4122214708*red+0.5363325363*green+0.0514459929*blue);
 const m=Math.cbrt(0.2119034982*red+0.6806995451*green+0.1073969566*blue);
 const s=Math.cbrt(0.0883024619*red+0.2817188376*green+0.6299787005*blue);
 return {
  ansi:foreground+';48;2;'+rgb.join(';'),distance:Infinity,
  lab:[0.2104542553*l+0.7936177850*m-0.0040720468*s,
   1.9779984951*l-2.4285922050*m+0.4505937099*s,
   0.0259040371*l+0.7827717662*m-0.8086757660*s]
 };
}
function contestHeaderColors(count){
 if(!count)return [];
 const levels=[32,64,96,128,160,192,224,255],candidates=[];
 for(const red of levels)for(const green of levels)for(const blue of levels){
  const candidate=headerColor([red,green,blue]);
  if(candidate.lab[0]>=0.35&&candidate.lab[0]<=0.9)candidates.push(candidate);
 }
 const colors=[],used=new Set();
 let next=candidates.splice(randomInt(candidates.length),1)[0];
 // Each choice maximizes its visual difference from the closest existing color.
 while(next&&colors.length<count){
  colors.push(next.ansi);used.add(next.ansi);
  let best=-1;
  for(let i=0;i<candidates.length;i++){
   const candidate=candidates[i];
   const distance=(candidate.lab[0]-next.lab[0])**2+(candidate.lab[1]-next.lab[1])**2+(candidate.lab[2]-next.lab[2])**2;
   candidate.distance=Math.min(candidate.distance,distance);
   if(best<0||candidate.distance>candidates[best].distance)best=i;
  }
  next=best<0?undefined:candidates.splice(best,1)[0];
 }
 while(colors.length<count){
  const color=headerColor([randomInt(48,241),randomInt(48,241),randomInt(48,241)]).ansi;
  if(!used.has(color)){used.add(color);colors.push(color);}
 }
 for(let i=colors.length-1;i>0;i--){const other=randomInt(i+1);[colors[i],colors[other]]=[colors[other],colors[i]];}
 return colors;
}
function newContestBoard(dashboard,problems,importId,previous,sessionHint){
 if(previous&&sessionHint&&previous.contest===dashboard.contest&&previous.section===dashboard.section&&
    previous.problems.length===problems.length&&problems.every((problem,index)=>problem.target===previous.problems[index].target)&&
    (!previous.session||previous.session.participant===sessionHint.participant&&
     (!sessionHint.virtual||Math.abs(previous.session.endsAt-sessionHint.endsAt)<=5000)))return previous;
 const colors=contestHeaderColors(problems.length);
 return {
  id:importId||randomUUID(),contest:dashboard.contest,section:dashboard.section,colorVersion:3,
  ...(dashboard.startedAt?{startedAt:dashboard.startedAt}:{}),
  problems:problems.map(({index,target},position)=>({index,target,headerColor:colors[position],tries:0,solved:false}))
 };
}
function submissionStatusContext(state,spec){
 return {
  oj:spec.oj,version:state.submissionHistoryVersion||0,
  boardId:profileFor(state,spec.oj).contestBoard?.id,
  target:spec.oj==='qoj'?(spec.contest?spec.url:spec.problem):cfProblemKey(spec)
 };
}
function recordContestAttempt(board,target,id,result){
 const problem=board.problems.find(item=>item.target===target);
 if(!problem||problem.solved||result?.submittedAt<board.startedAt)return false;
 const runs=problem.runs||{};
 if(!Object.hasOwn(runs,id)&&problem.lastRunId!==id)problem.tries++;
 problem.lastRunId=id;
 const runState=result?.state||(result?'final':'pending');
 runs[id]=board.startedAt&&runState==='final'&&!result.solved&&isPenaltyVerdict(result.rawVerdict??result.verdict)?'rejected':runState;
 problem.runs=runs;
 problem.solved=!!result?.solved;
 if(problem.solved&&board.startedAt&&Number.isSafeInteger(result.submittedAt)){
  problem.solvedMinutes=Math.floor((result.submittedAt-board.startedAt)/60000);
  const rejected=Object.values(runs).filter(state=>state==='rejected').length;
  problem.penaltyMinutes=problem.solvedMinutes+20*rejected;
 }
 problem.pending=!problem.solved&&Object.values(runs).includes('pending');
 return true;
}
function inContestSession(board,entry){
 return Number.isSafeInteger(entry.submittedAt)&&entry.submittedAt>=board.startedAt&&entry.submittedAt<board.session.endsAt;
}
function replayContestSubmissions(board){
 board.submissions.sort((a,b)=>a.submittedAt-b.submittedAt||Number(a.id)-Number(b.id));
 board.problems=board.problems.map(({index,target,headerColor})=>({index,target,headerColor,tries:0,solved:false}));
 for(const entry of board.submissions)recordContestAttempt(board,entry.target,entry.id,entry);
}
function contestRecent(board){return board.submissions.slice(-10).reverse();}
async function recoverContestSubmissions({oj,importId,session},file=preferencesFile){
 const {startedAt,endsAt,participant,submissions}=session||{};
 if(oj!=='cf'||!importId||!Number.isSafeInteger(startedAt)||startedAt<=0||startedAt>Date.now()||
    !Number.isSafeInteger(endsAt)||endsAt<=startedAt||typeof participant!=='string'||!participant||!Array.isArray(submissions))throw Error('赛时记录缺少有效场次信息。');
 return withStateLock(file,()=>{
  const state=readPreferences(file),board=state.contestBoard,added=state.lastAddition;
  if(added?.importId!==importId||added.kind!=='contest'||!board||board.contest!==added.contest||board.section!==added.section)throw Error('导入已更新，未应用旧的赛时记录。');
  const active=ojModeFor(state).id===oj,previous=board.session;
  const sameSession=!previous||previous.participant===participant&&
   (board.startedAt===startedAt||participant.startsWith('virtual:')&&Math.abs(board.startedAt-startedAt)<=5000);
  board.startedAt=startedAt;board.session={endsAt,participant};
  const targets=new Map(board.problems.map(problem=>[problem.index,problem.target]));
  const entries=new Map();
  if(sameSession){
   const local=board.submissions||[];
   const history=active?(state.submissionHistory||[]).filter(entry=>entry.boardId===board.id):[];
   for(const entry of [...local,...history])if(entry.target&&inContestSession(board,entry))entries.set(entry.id,entry);
  }
  for(const run of submissions){
   const target=targets.get(run?.index),id=String(run?.id);
   if(!target||!/^[1-9]\d*$/.test(id)||!inContestSession(board,run)||typeof run.verdict!=='string'||!['pending','final','unknown'].includes(run.state))throw Error('赛时提交记录无效。');
   const {submittedAt,state:runState,verdict,time,memory,score}=run;
   const local=entries.get(id);
   if(local?.state==='final'&&runState==='pending'&&!/^pretests? passed\b/i.test(local.rawVerdict??local.verdict))continue;
   const problem=(board.section==='gym'?'Gym ':'')+board.contest+run.index;
   entries.set(id,{id,target,boardId:board.id,submittedAt,problem,file:local?.file,state:runState,verdict,time,memory,score,
    solved:runState==='final'&&contestReport(verdict).label==='CORRECT',
    ...(runState==='pending'?{deadline:local?.deadline??endsAt+600000,monitorPid:local?.monitorPid}:{})});
  }
  board.submissions=[...entries.values()];
  replayContestSubmissions(board);
  const patch={contestBoard:board,lastAddition:{...added,startedAt}};
  if(active)patch.submissionHistory=contestRecent(board);
  updatePreferences(patch,file);
  return {restored:board.submissions.length};
 });
}
function restoreContestBoard(state,site){
 const profile=profileFor(state,site),addition=profile.lastAddition;
 if(profile.contestBoard||addition?.kind!=='contest'||!addition.directory)return null;
 const problems=new Map(),labels=new Map();
 for(const [file,target] of Object.entries(profile.fileProblems||{})){
  if(fileKey(path.dirname(file))!==fileKey(addition.directory))continue;
  let parsed;try{parsed=parseProblem(target,site);}catch{continue;}
  if(parsed.contest!==addition.contest||(parsed.section||'contest')!==(addition.section||'contest'))continue;
  const index=site==='cf'?parsed.problem:path.parse(file).name.toUpperCase();
  if(!/^[A-Z]+\d*$/.test(index))continue;
  problems.set(index,{index,target});
  const label=site==='qoj'?'QOJ #'+parsed.problem+' / 比赛 '+parsed.contest:(parsed.section==='gym'?'Gym ':'')+parsed.contest+parsed.problem;
  labels.set(label,target);
 }
 if(!problems.size)return null;
 const board=newContestBoard(addition,[...problems.values()].sort((a,b)=>a.index.localeCompare(b.index,'en',{numeric:true})),addition.importId);
 // Older versions retained file mappings and recent results without a board.
 for(const entry of [...(state.submissionHistory||[])].reverse()){
  if(board.startedAt&&entry.boardId!==board.id)continue;
  const target=entry.target||labels.get(entry.problem);
  if(target)recordContestAttempt(board,target,entry.id,{...entry,solved:entry.solved??contestReport(entry.verdict,{qoj:site==='qoj'}).label==='CORRECT'});
 }
 return board;
}
async function recordSubmission(context,id,result,file=preferencesFile){
 return withStateLock(file,()=>{
  const state=readPreferences(file),board=profileFor(state,context.oj).contestBoard,patch={};
  const active=(state.submissionHistoryVersion||0)===context.version&&ojModeFor(state).id===context.oj;
  const currentBoard=context.boardId&&board?.id===context.boardId;
  const entry=result&&{...result,boardId:context.boardId};
  if(entry&&context.oj==='cf')entry.target=context.target;
  if(entry&&currentBoard&&board.session){
   if(!board.problems.some(problem=>problem.target===context.target)||!inContestSession(board,entry))delete entry.boardId;
   else if(/^pretests? passed\b/i.test(entry.rawVerdict??entry.verdict)){
    entry.state='pending';entry.deadline=board.session.endsAt+600000;
   }
  }
  if(entry&&active){
   const recent=state.submissionHistory||[];
   const existing=recent.findIndex(entry=>entry.id===id);
   // Updating a pending run must keep its submission order.
   patch.submissionHistory=existing<0?[entry,...recent].slice(0,10):recent.map(previous=>previous.id===id?entry:previous);
  }
  if(currentBoard&&board.session){
   if(entry?.boardId){
    board.submissions=board.submissions.filter(previous=>previous.id!==id).concat(entry);
    replayContestSubmissions(board);
    Object.assign(patch,profilePatch(state,{contestBoard:board},context.oj));
    if(active)patch.submissionHistory=contestRecent(board);
   }else if(active&&Date.now()<board.session.endsAt)delete patch.submissionHistory;
  }else if(currentBoard&&recordContestAttempt(board,context.target,id,result)){
   Object.assign(patch,profilePatch(state,{contestBoard:board},context.oj));
  }
  if(Object.keys(patch).length)updatePreferences(patch,file);
 });
}
async function refreshSubmissionStatus(file=preferencesFile){
 return withStateLock(file,()=>{
  const state=readPreferences(file),site=ojModeFor(state).id,patch={};
  const restored=restoreContestBoard(state,site);
  if(restored)Object.assign(state,profilePatch(state,{contestBoard:restored},site));
  const unavailable=entry=>{
   if(entry.state!=='pending')return false;
   if(entry.deadline&&Date.now()>=entry.deadline)return true;
   if(!entry.monitorPid)return false;
   try{process.kill(entry.monitorPid,0);return false;}catch(error){return error.code==='ESRCH';}
  };
  const board=profileFor(state,site).contestBoard;
  const unknown=new Set([...(state.submissionHistory||[]),...(board?.submissions||[])].filter(unavailable).map(entry=>entry.id));
  if(unknown.size&&state.submissionHistory)patch.submissionHistory=state.submissionHistory.map(entry=>unknown.has(entry.id)&&entry.state==='pending'?{...entry,state:'unknown',verdict:'UNKNOW'}:entry);
  const recolor=board&&board.colorVersion!==3;
  if(recolor){
   const colors=contestHeaderColors(board.problems.length);
   board.problems.forEach((problem,index)=>{problem.headerColor=colors[index];});
   board.colorVersion=3;
  }
  if(board&&(restored||unknown.size||recolor)){
   if(unknown.size){
    if(board.submissions){
     board.submissions=board.submissions.map(entry=>unknown.has(entry.id)&&entry.state==='pending'?{...entry,state:'unknown',verdict:'UNKNOW'}:entry);
     replayContestSubmissions(board);
    }else for(const problem of board.problems){
     for(const id of unknown)if(problem.runs?.[id]==='pending')problem.runs[id]='unknown';
     problem.pending=!problem.solved&&Object.values(problem.runs||{}).includes('pending');
    }
   }
   Object.assign(patch,profilePatch(state,{contestBoard:board},site));
  }
  return Object.keys(patch).length?updatePreferences(patch,file):state;
 });
}
function languageType(file){
 const ext=path.extname(file).toLowerCase();
 const types={'.cpp':'cpp','.cc':'cpp','.cxx':'cpp','.c':'c','.py':'python','.java':'java','.rs':'rust'};
 if(!types[ext])throw Error('不支持的文件类型');return types[ext];
}
function languageFor(file,state,oj=ojModeFor(state).id){
 const type=languageType(file);
 return profileFor(state,oj).languages?.[type]||(oj==='qoj'?{cpp:'C++23',c:'C11',python:'Python 3',java:'Java',rust:'Rust'}:{cpp:'GNU G++23',c:'C',python:'Python',java:'Java',rust:'Rust'})[type];
}
function fileKey(file){const absolute=path.resolve(file);return process.platform==='win32'?absolute.toLowerCase():absolute;}
function defaultFor(file,state,oj=ojModeFor(state).id){const profile=profileFor(state,oj);return profile.fileProblems?.[fileKey(file)]||profile.defaultProblem;}
function sequenceName(index){let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name+'.cpp';}
async function withStateLock(file,operation){
 const lock=file+'.lock';let handle;
 for(let attempt=0;attempt<100;attempt++){
  try{handle=await fs.promises.open(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(resolve=>setTimeout(resolve,50));}
 }
 if(!handle)throw Error('题号记录正在更新，请稍后重试。');
 try{return await operation();}finally{await handle.close();await fs.promises.unlink(lock);}
}
async function resetCliState(file=preferencesFile){
 // Retain the generation so a result from before clear cannot repopulate the state.
 return withStateLock(file,()=>writePreferences({submissionHistoryVersion:resetSubmissionHistory(readPreferences(file)).submissionHistoryVersion},file));
}
async function saveDefault(file,problem,stateFile=preferencesFile,oj){
 return withStateLock(stateFile,()=>{const state=readPreferences(stateFile),site=oj||ojModeFor(state).id;parseProblem(problem,site);const profile=profileFor(state,site);return updatePreferences(profilePatch(state,{defaultProblem:problem,fileProblems:{...profile.fileProblems,[fileKey(file)]:problem}},site),stateFile);});
}
module.exports={preferencesFile,parseProblem,cfProblemKey,readPreferences,updatePreferences,languageType,languageFor,fileKey,defaultFor,sequenceName,withStateLock,resetCliState,saveDefault,ojModeFor,selectOj,requireAvailableOj,profileFor,profilePatch,updateOjPreferences,verdictModeFor,selectVerdictMode,newContestBoard,submissionStatusContext,recordSubmission,refreshSubmissionStatus,recoverContestSubmissions};
