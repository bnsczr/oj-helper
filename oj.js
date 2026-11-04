#!/usr/bin/env node
'use strict';
const {preferencesFile,readPreferences,ojModeFor,selectOj}=require('./preferences');
async function main(args=process.argv.slice(2),{stateFile=preferencesFile,log=console.log}={}){
 if(!args.length||(args.length===1&&['--help','-h'].includes(args[0]))){
  const mode=ojModeFor(readPreferences(stateFile));
  log('当前 OJ：'+mode.name+(mode.available?'':'（功能暂未实现）'));
  log('oj CF：切换为 Codeforces helper\noj qoj：切换为 QOJ helper\n选择会保存，重启终端后仍然生效。');return mode;
 }
 if(args.length!==1)throw Error('用法：oj CF 或 oj qoj。');
 const mode=await selectOj(args[0],stateFile);
 log('已切换到 '+mode.name+' helper。'+(mode.available?'可继续使用 submit、open 等命令。':'QOJ 功能暂未实现；运行 oj CF 可切回 Codeforces。'));
 return mode;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
