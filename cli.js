#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readline=require('node:readline/promises');
const {createBridge}=require('./bridge');
const {notifyBrowser}=require('./wakeup');
const {parseProblem,readPreferences,updatePreferences,languageFor,languageType,defaultFor,clearDefaults,saveDefault,ojModeFor,requireAvailableOj,profileFor,updateOjPreferences,verdictModeFor}=require('./preferences');
const secretFile=path.join(__dirname,'.bridge-secret');
function getSecret(){try{return fs.readFileSync(secretFile,'utf8').trim();}catch(e){if(e.code!=='ENOENT')throw e;const secret=crypto.randomBytes(32).toString('hex');fs.writeFileSync(secretFile,secret,{flag:'wx',mode:0o600});return secret;}}
function parse(file){const m=/^([1-9]\d*)([A-Za-z]\d*)$/.exec(path.parse(file).name);if(!m)throw Error('文件名应为 1A.cpp、123B1.py 等');const ext=path.extname(file).toLowerCase();const langs={'.cpp':'C++','.cc':'C++','.c':'C','.py':'Python','.java':'Java','.rs':'Rust'};if(!langs[ext])throw Error('不支持的文件类型');return {contest:m[1],problem:m[2].toUpperCase(),language:langs[ext]};}
function resolveSourceFile(input,state,{cwd=process.cwd()}={}){
 const local=path.resolve(cwd,input),directory=state.lastAddition?.directory;
 // Explicit paths and existing local files always keep their original meaning.
 if(fs.existsSync(local)||path.basename(input)!==input||path.isAbsolute(input))return local;
 if(typeof directory==='string'&&path.isAbsolute(directory))return path.join(directory,input);
 return local;
}
async function confirmSubmission(rl,spec,{saveProblem=value=>updateOjPreferences({defaultProblem:value},spec.oj||'cf'),log=console.log}={}){
 while(true){
  const target=spec.oj==='qoj'?(spec.problem?'QOJ #'+spec.problem+(spec.contest?'（比赛 '+spec.contest+'）':'（题库提交）'):'没有默认题号，请点击 c 修改默认题号'):spec.contest?spec.contest+spec.problem:'没有默认题号，请点击 c 修改默认题号';
  const answer=(await rl.question(`题目：${target}，语言：${spec.language}\n确认提交该题目？y 提交；n 取消；c 修改并保存默认题号：`)).trim().toLowerCase();
  if(answer==='c'){
   const value=await rl.question(spec.oj==='qoj'?'请输入 QOJ 数字题号或题目网址：':'请输入新的默认题号（例如 2278F）：');
   try{const problem=parseProblem(value,spec.oj||'cf'),saved=spec.oj==='qoj'?(problem.contest?problem.url:problem.problem):problem.contest+problem.problem;await saveProblem(saved);Object.assign(spec,problem);log('默认题号已保存：'+saved);}catch(e){log(e.message);}
   continue;
  }
  if(answer==='y'){
   if(spec.oj==='qoj'?spec.problem:spec.contest)return true;
   log('没有默认题号，请点击 c 修改默认题号');continue;
  }
  return false;
 }
}
async function main(){
 const args=process.argv.slice(2);
 if(args[0]==='clear()'||args[0]==='clear'){const mode=requireAvailableOj(readPreferences());await clearDefaults(undefined,mode.id);console.log('已清空 '+mode.name+' 的所有默认提交题号，新建文件序号已重置为 A.cpp、B.cpp、C.cpp…（已有源码保留）。');return;}
 if(args[0]==='--pair'){console.log('配对码（请勿分享）：\n'+getSecret()+'\n在扩展详情 → 扩展程序选项中粘贴并保存。');return;}
 if(args[0]==='--install-native'){const {installNative}=require('./native-install');const ids=installNative(args.slice(1).length?args.slice(1):undefined);console.log('oj-helper 本机助手已安装。刷新扩展至 1.14.6 后，支持 CF / QOJ 添加文件与即时提交，无需常驻终端。已连接扩展：'+ids.join('、'));return;}
 if(args[0]==='--serve-files'){requireAvailableOj(readPreferences());try{await require('./files-server').serveFiles(getSecret());}catch(e){if(e.code==='EADDRINUSE')throw Error('文件助手端口 27122 已被占用；若助手已在运行，无需再次启动。');throw e;}return;}
 if(!args.length||args.includes('--help')){const mode=ojModeFor(readPreferences());console.log('当前 OJ：'+mode.name+(mode.available?'':'（功能暂未实现，请运行 oj CF）')+'\noj CF / oj qoj：切换 OJ 模式\nsubmit A.cpp [--lang 编译器名称片段]（题号取最近点击 + 或 c 保存的默认题号）\nsubmit clear：清空默认题号并重置文件序号（clear() 请加引号）\nsubmit --pair：显示浏览器扩展配对码\nsubmit --install-native [扩展ID]：一次性连接浏览器自动文件助手（无需常驻终端）\nsubmit --serve-files：旧版文件助手兼容入口\n浏览器需已运行；正常提交在后台完成，结果显示在终端。');return;}
 const state=readPreferences(),mode=requireAvailableOj(state);
 const file=resolveSourceFile(args[0],profileFor(state,mode.id)),target=defaultFor(file,state,mode.id),spec={oj:mode.id,...(target?parseProblem(target,mode.id):{}),language:languageFor(file,state,mode.id),fileName:path.basename(file)};const source=fs.readFileSync(file,'utf8');if(!source.trim())throw Error('源码为空');
 for(let i=1;i<args.length;i++){if(args[i]==='--lang'&&args[i+1])spec.language=args[++i];else if(args[i]==='--browser'&&args[i+1]){i++;console.log('后台模式使用已配对的浏览器，忽略 --browser。');}else throw Error('未知参数或参数缺少值：'+args[i]);}
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});let confirmed;
 try{console.log(`当前 OJ：${mode.name}\n文件：${file}`);confirmed=await confirmSubmission(rl,spec,{saveProblem:value=>saveDefault(file,value,undefined,mode.id)});}finally{rl.close();}
 if(!confirmed){console.log('已取消');return;}
 const confirmedState=readPreferences(),current=profileFor(confirmedState,mode.id);await updateOjPreferences({languages:{...current.languages,[languageType(file)]:spec.language}},mode.id);
 spec.verdictMode=verdictModeFor(confirmedState);
 if(spec.verdictMode==='contest')console.log('比赛模式：只显示评测结论（需要浏览器扩展 1.14.4 或更新版本）。');
 const secret=getSecret(),token=crypto.randomBytes(24).toString('hex');let timer,reminder,closed=false;
 const stop=()=>{if(closed)return;closed=true;clearTimeout(timer);clearTimeout(reminder);server.close();server.closeIdleConnections();};
 const server=createBridge({secret,token,job:{...spec,source},onEvent:event=>{clearTimeout(reminder);console.log(event.message);if(event.final){process.exitCode=event.ok?0:1;stop();}}});
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(27121,'127.0.0.1',resolve);});}catch(e){if(e.code==='EADDRINUSE')throw Error('已有提交正在运行或 27121 端口被占用，请等待完成后重试。');throw e;}
 console.log('正在通知已配对的浏览器扩展立即领取任务。正常提交不会切换浏览器，评测结果将在这里显示。');
 reminder=setTimeout(()=>console.log('若尚无进展：确认浏览器正在运行、扩展已更新，并运行 submit --pair 完成一次配对。'),45000);
 timer=setTimeout(()=>{console.error('等待超时，结果未知。请先核对网站提交记录，避免重复提交。');process.exitCode=1;stop();server.closeAllConnections();},600000);
 if(!await notifyBrowser(secret)&&!closed)console.log('即时连接尚未就绪，已回退到定时领取（通常 30 秒内）；更新扩展及本机助手后可启用即时提交。');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={parse,confirmSubmission,resolveSourceFile};
