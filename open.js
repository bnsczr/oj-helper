#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readPreferences,preferencesFile,requireAvailableOj,profileFor,ojModeFor,updateOjPreferences}=require('./preferences');
const {createBridge}=require('./bridge');
const {notifyBrowser}=require('./wakeup');
const {openInVSCode}=require('./editor');
const {saveStandings}=require('./standings-report');
const {terminalMessage}=require('./terminal-ui');
function lastAddition(state){
 const oj=ojModeFor(state).id,added=profileFor(state,oj).lastAddition;
 if(!added||! /^(contest|problem)$/.test(added.kind)||!(oj==='qoj'?/^[1-9]\d*$/.test(added.problem||added.contest):/^[1-9]\d*$/.test(added.contest))||!path.isAbsolute(added.directory||''))throw Error('没有添加记录，open 命令无效。请先在 Dashboard 或题目页点击 +（或按 Shift+N）。');
 return added;
}
function normalizeCfStatement(markdown){
 // Match code first to leave sample data and inline code intact.
 const fencedCode=/^ {0,3}(?<fence>`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\k<fence>[ \t]*\r?$/.source;
 const inlineCode=/(?<!`)(?<ticks>`+)(?!`)[^\r\n]*?(?<!`)\k<ticks>(?!`)/.source;
 const cfMath=/(?<![\\$])\$\$\$((?:\\[\s\S]|[^\\$])+)\$\$\$(?!\$)/.source;
 const tokens=new RegExp([fencedCode,inlineCode,cfMath].join('|'),'gm');
 return markdown.replace(tokens,(token,_fence,_ticks,formula)=>{
  const tex=formula?.trim().replace(/\s*\r?\n\s*/g,' ');
  return tex?'$'+tex+'$':token;
 });
}
async function saveStatement(state){
 const added=lastAddition(state);
 if(typeof added.statement!=='string'||!added.statement.trim())throw Error('该添加记录没有题面内容，请更新并刷新扩展及网页，重新点击 + 后重试。');
 const target=path.join(added.directory,'statement.md');
 try{if(!(await fs.lstat(target)).isFile())throw Error('statement.md 不是普通文件，无法覆盖。');}catch(e){if(e.code!=='ENOENT')throw e;}
 const markdown=ojModeFor(state).id==='cf'?normalizeCfStatement(added.statement):added.statement;
 await fs.writeFile(target,markdown,'utf8');
 return target;
}
async function openStandings(state,{secret,timeout=180000,log=console.log,port=27121,onListening=()=>{}}={}){
 const added=lastAddition(state),token=crypto.randomBytes(24).toString('hex');
 if(!secret)throw Error('尚未配对，请先运行 submit --pair。');
 return new Promise((resolve,reject)=>{
  let timer,finished=false;
  const finish=(error,standings)=>{if(finished)return;finished=true;clearTimeout(timer);server.close(()=>{if(error)reject(error);else resolve(standings);});server.closeIdleConnections();};
  const server=createBridge({secret,token,job:{oj:ojModeFor(state).id,action:'open-standings',contest:added.contest,section:added.section||'contest'},onEvent:event=>{
   if(event.final)finish(event.ok?undefined:Error(event.message),event.standings);
  }});
  server.once('error',error=>finish(Error(error.code==='EADDRINUSE'?'已有浏览器任务正在运行，请等待完成后重试。':error.message)));
  server.listen(port,'127.0.0.1',()=>{
   log('正在通知浏览器扩展在新标签页打开 '+(ojModeFor(state).id==='qoj'?'QOJ External Standings':'Friends standings')+' 并读取完整榜单…');
   onListening(server.address().port);
   timer=setTimeout(()=>{finish(Error('读取榜单超时，请确认浏览器已启动、扩展已更新并配对，并检查榜单页登录或验证。'));server.closeAllConnections();},timeout);
   if(port===27121)notifyBrowser(secret).catch(()=>{});
  });
 });
}
async function main(args=process.argv.slice(2),{stateFile=preferencesFile,openEditor=openInVSCode,openBoard=openStandings,chooseContest,log=console.log}={}){
 if(args.length!==1||!['s','b'].includes(args[0]))throw Error('用法：open s 保存最近添加的题面；open b 在新标签页打开对应比赛榜单。');
 const state=readPreferences(stateFile),mode=requireAvailableOj(state);const added=lastAddition(state);
 if(args[0]==='s'){
  if(mode.id==='qoj'){
   const upgraded=await require('./qoj-files').upgradeQojStatement(added);
   if(upgraded!==added){state.qoj={...state.qoj,lastAddition:upgraded};await updateOjPreferences({lastAddition:upgraded},'qoj',stateFile,state.submissionHistoryVersion||0);}
  }
  const target=await saveStatement(state);log(terminalMessage('题面',target));
  await openEditor(target);log(terminalMessage('编辑器','已在 VS Code 中打开 statement.md。'));return;
 }
 if(mode.id==='qoj'&&!added.contest){
  const options=(added.contests||[]).map(id=>'https://qoj.ac/contest/'+id);
  let value;
  if(chooseContest)value=await chooseContest(options);
  else{const rl=require('node:readline/promises').createInterface({input:process.stdin,output:process.stdout});try{log('当前题目没有唯一比赛上下文。'+(options.length?'候选比赛：'+options.join('、'):''));value=await rl.question('请输入要打开榜单的 QOJ 比赛编号或网址（留空取消）：');}finally{rl.close();}}
  if(!value?.trim()){log('已取消打开榜单。');return;}
  const match=/^(?:https:\/\/qoj\.ac\/contest\/)?([1-9]\d*)\/?$/.exec(value.trim());if(!match)throw Error('QOJ 比赛编号或网址无效。');
  added.contest=match[1];await updateOjPreferences({lastAddition:added},'qoj',stateFile,state.submissionHistoryVersion||0);
 }
 let secret;try{secret=(await fs.readFile(path.join(path.dirname(stateFile),'.bridge-secret'),'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;}
 const standings=await openBoard(state,{secret,log});
 const target=await saveStandings(lastAddition(state),standings);log(terminalMessage('榜单',target));
 await openEditor(target);log(terminalMessage('编辑器','已在 VS Code 中打开 standings.md。'));
}
if(require.main===module)main().catch(error=>{console.error(terminalMessage('错误',error.message));process.exitCode=1;});
module.exports={lastAddition,saveStatement,openStandings,main};
