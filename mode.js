#!/usr/bin/env node
'use strict';
const {preferencesFile,readPreferences,verdictModeFor,selectVerdictMode}=require('./preferences');
const {terminalMessage}=require('./terminal-ui');
async function main(args=process.argv.slice(2),{stateFile=preferencesFile,log=console.log}={}){
 const value=args[0]?.toLowerCase();
 if(args.length>1)throw Error('用法：mode contest、mode normal 或 mode status。');
 if(!value||['status','--help','-h'].includes(value)){
  const mode=verdictModeFor(readPreferences(stateFile));
  log('当前评测显示：'+(mode==='contest'?'比赛模式':'正常模式'));
  if(value!=='status')log('mode contest：仅显示评测结论\nmode normal：恢复详细评测和 checker');
  return mode;
 }
 const mode=await selectVerdictMode(value,stateFile);
 log(terminalMessage('模式',mode==='contest'?'比赛 · 只显示评测结论':'正常 · 显示可用的评测详情和 checker'));
 return mode;
}
if(require.main===module)main().catch(error=>{console.error(terminalMessage('错误',error.message));process.exitCode=1;});
module.exports={main};
