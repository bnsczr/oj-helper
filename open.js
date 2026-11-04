#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readPreferences,preferencesFile}=require('./preferences');
const {createBridge}=require('./bridge');
const {notifyBrowser}=require('./wakeup');
const {openInVSCode}=require('./editor');
const {saveStandings}=require('./standings-report');
function lastAddition(state){
 const added=state.lastAddition;
 if(!added||! /^(contest|problem)$/.test(added.kind)||! /^[1-9]\d*$/.test(added.contest)||!path.isAbsolute(added.directory||''))throw Error('没有添加记录，open 命令无效。请先在 Dashboard 或题目页点击 +（或按 Shift+N）。');
 return added;
}
async function saveStatement(state){
 const added=lastAddition(state);
 if(typeof added.statement!=='string'||!added.statement.trim())throw Error('该添加记录没有题面内容，请更新并刷新扩展及网页，重新点击 + 后重试。');
 const target=path.join(added.directory,'statement.md');
 try{if(!(await fs.lstat(target)).isFile())throw Error('statement.md 不是普通文件，无法覆盖。');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.writeFile(target,added.statement,'utf8');
 return target;
}
async function openStandings(state,{secret,timeout=180000,log=console.log,port=27121,onListening=()=>{}}={}){
 const added=lastAddition(state),token=crypto.randomBytes(24).toString('hex');
 if(!secret)throw Error('尚未配对，请先运行 submit --pair。');
 return new Promise((resolve,reject)=>{
  let timer,finished=false;
  const finish=(error,standings)=>{if(finished)return;finished=true;clearTimeout(timer);server.close(()=>{if(error)reject(error);else resolve(standings);});server.closeIdleConnections();};
  const server=createBridge({secret,token,job:{action:'open-standings',contest:added.contest,section:added.section||'contest'},onEvent:event=>{
   if(event.final)finish(event.ok?undefined:Error(event.message),event.standings);
  }});
  server.once('error',error=>finish(Error(error.code==='EADDRINUSE'?'已有浏览器任务正在运行，请等待完成后重试。':error.message)));
  server.listen(port,'127.0.0.1',()=>{
   log('正在通知浏览器扩展在新标签页打开 Friends standings 并读取完整榜单…');
   onListening(server.address().port);
   timer=setTimeout(()=>{finish(Error('读取榜单超时，请确认浏览器已启动、扩展已更新并配对，并检查榜单页登录或验证。'));server.closeAllConnections();},timeout);
   if(port===27121)notifyBrowser(secret).catch(()=>{});
  });
 });
}
async function main(args=process.argv.slice(2),{stateFile=preferencesFile,openEditor=openInVSCode,openBoard=openStandings,log=console.log}={}){
 if(args.length!==1||!['s','b'].includes(args[0]))throw Error('用法：open s 保存最近添加的题面；open b 在新标签页打开对应比赛榜单。');
 const state=readPreferences(stateFile);lastAddition(state);
 if(args[0]==='s'){
  const target=await saveStatement(state);log('已保存题面（覆盖同名文件）：'+target);
  await openEditor(target);log('已在 VS Code 中打开 statement.md。');return;
 }
 let secret;try{secret=(await fs.readFile(path.join(path.dirname(stateFile),'.bridge-secret'),'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;}
 const standings=await openBoard(state,{secret,log});
 const target=await saveStandings(lastAddition(state),standings);log('已保存完整好友榜单：'+target);
 await openEditor(target);log('已在 VS Code 中打开 standings.md。');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={lastAddition,saveStatement,openStandings,main};
