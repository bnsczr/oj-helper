#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readline=require('node:readline/promises');
const {runSubmission}=require('./submission-runner');
const {createSubmissionView,problemLabel,terminalMessage,showSubmissionStatus}=require('./terminal-ui');
const {parseProblem,cfProblemKey,readPreferences,languageFor,languageType,defaultFor,resetCliState,saveDefault,ojModeFor,requireAvailableOj,profileFor,updateOjPreferences,verdictModeFor,submissionStatusContext,refreshSubmissionStatus}=require('./preferences');
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
  log(terminalMessage('题号',problemLabel(spec)));
  log(terminalMessage('语言',spec.language));
  const answer=(await rl.question('确认提交  [y] 提交  [n] 取消  [c] 修改默认题号 > ')).trim().toLowerCase();
  if(answer==='c'){
   const value=await rl.question(spec.oj==='qoj'?'QOJ 数字题号或题目网址 > ':'CF 题号（例如 2278F）或 Gym 题目网址 > ');
   try{
    const problem=parseProblem(value,spec.oj||'cf');
    const saved=spec.oj==='qoj'?(problem.contest?problem.url:problem.problem):cfProblemKey(problem);
    await saveProblem(saved);
    Object.assign(spec,{section:undefined},problem);
    log('默认题号已保存：'+saved);
   }catch(e){log(e.message);}
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
 if(args[0]==='status'){
  if(args.length!==1)throw Error('用法：submit status');
  const state=await refreshSubmissionStatus(),site=requireAvailableOj(state);
  showSubmissionStatus({site,contest:verdictModeFor(state)==='contest',board:profileFor(state,site.id).contestBoard,history:state.submissionHistory||[]});
  return;
 }
 if(args[0]==='clear()'||args[0]==='clear'){
  if(args.length!==1)throw Error('用法：submit clear');
  await resetCliState();
  console.log('命令行已重置为 Codeforces · 正常模式。提交记录、比赛统计、题号映射、题面缓存和语言偏好已清空。');
  return;
 }
 if(args[0]==='--pair'){console.log('配对码（请勿分享）：\n'+getSecret()+'\n在扩展详情 → 扩展程序选项中粘贴并保存。');return;}
 if(args[0]==='--install-native'){const {installNative}=require('./native-install');const ids=installNative(args.length>1?args.slice(1):undefined);console.log('oj-helper 本机助手已安装。请重新加载浏览器扩展。已注册扩展：'+ids.join('、'));return;}
 if(args[0]==='--serve-files'){requireAvailableOj(readPreferences());try{await require('./files-server').serveFiles(getSecret());}catch(e){if(e.code==='EADDRINUSE')throw Error('文件助手端口 27122 已被占用；若助手已在运行，无需再次启动。');throw e;}return;}
 if(!args.length||args.includes('--help')){const mode=ojModeFor(readPreferences());console.log('当前 OJ：'+mode.name+(mode.available?'':'（功能暂未实现，请运行 oj CF）')+'\noj CF / oj qoj：切换 OJ 模式\nsubmit A.cpp [--lang 编译器名称片段]（题号取最近点击 + 或 c 保存的默认题号）\nsubmit status：查看最近 10 次提交和比赛统计\nsubmit clear：重置所有命令行状态（clear() 请加引号）\nsubmit --pair：显示浏览器扩展配对码\nsubmit --install-native [扩展ID]：一次性连接浏览器自动文件助手（无需常驻终端）\nsubmit --serve-files：旧版文件助手兼容入口\n浏览器需已运行；正常提交在后台完成，结果显示在终端。');return;}
 const state=readPreferences(),mode=requireAvailableOj(state);
 const file=resolveSourceFile(args[0],profileFor(state,mode.id)),target=defaultFor(file,state,mode.id),spec={oj:mode.id,...(target?parseProblem(target,mode.id):{}),language:languageFor(file,state,mode.id),fileName:path.basename(file)};const source=fs.readFileSync(file,'utf8');if(!source.trim())throw Error('源码为空');
 for(let i=1;i<args.length;i++){if(args[i]==='--lang'&&args[i+1])spec.language=args[++i];else if(args[i]==='--browser'&&args[i+1]){i++;console.log('后台模式使用已配对的浏览器，忽略 --browser。');}else throw Error('未知参数或参数缺少值：'+args[i]);}
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});let confirmed;
 const prompt=process.stdout.isTTY?rl:{question:label=>rl.question(label.trimEnd()+'\n')};
 try{
  console.log('── 提交 · '+mode.name+' ──');
  console.log(terminalMessage('文件',file));
  console.log(terminalMessage('模式',verdictModeFor(state)==='contest'?'比赛':'正常'));
  confirmed=await confirmSubmission(prompt,spec,{saveProblem:value=>saveDefault(file,value,undefined,mode.id)});
 }finally{rl.close();}
 if(!confirmed){console.log(terminalMessage('提交','已取消'));return;}
 const confirmedState=await refreshSubmissionStatus(),current=profileFor(confirmedState,mode.id);
 spec.verdictMode=verdictModeFor(confirmedState);
 const statusContext=submissionStatusContext(confirmedState,spec);
 const view=createSubmissionView(spec);
 const monitor=runSubmission({secret:getSecret(),job:{...spec,source},context:statusContext},view);
 const saveLanguage=updateOjPreferences({languages:{...current.languages,[languageType(file)]:spec.language}},mode.id,undefined,statusContext.version)
  .catch(error=>view.notice('编译器偏好保存失败：'+error.message));
 process.exitCode=await monitor;
 await saveLanguage;
}
if(require.main===module)main().catch(e=>{console.error(terminalMessage('错误',e.message));process.exitCode=1;});module.exports={parse,confirmSubmission,resolveSourceFile};
