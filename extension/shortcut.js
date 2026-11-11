var ojBrowser=globalThis.browser??globalThis.chrome;
(()=>{
function waitForAdd(request,duration=30000){
 let timer;
 const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('本机助手响应超时；请检查文件及默认题号后再操作，避免重复添加。')),duration);});
 return Promise.race([request,timeout]).finally(()=>clearTimeout(timer));
}

 const previous=globalThis.__cfhelperShortcut;
 if(previous)window.removeEventListener('keydown',previous,true);
 let busy=false,banner,hideTimer;
 function show(message){
  clearTimeout(hideTimer);
  if(!banner){banner=document.createElement('div');banner.setAttribute('role','status');banner.style='position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff3cd;color:#111;padding:14px;border:1px solid #e0bd55;border-radius:6px;white-space:pre-wrap;max-width:480px;box-shadow:0 2px 8px #0003';document.documentElement.append(banner);}
  banner.textContent=message;
  if(message.startsWith('更新完成'))hideTimer=setTimeout(()=>{banner.remove();banner=null;},10000);
 }
 function progress(message){if(busy&&message.action==='oj-import-progress')show(message.text);}
 const messages=ojBrowser?.runtime?.onMessage;
 if(previous?.progress)messages?.removeListener(previous.progress);
 messages?.addListener(progress);
 const onKey=async event=>{
  if(!event.shiftKey||event.ctrlKey||event.altKey||event.metaKey||event.repeat||event.isComposing||!(event.code==='KeyN'||event.key?.toLowerCase()==='n'))return;
  const pressedAt=event.timeStamp>0&&typeof performance!=='undefined'?Math.floor(performance.timeOrigin+event.timeStamp):Date.now();
  const targets=event.composedPath?.()||[event.target];
  if(targets.some(target=>target?.isContentEditable||target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .CodeMirror, .ace_editor, .monaco-editor')))return;
  const isQoj=location.href.startsWith('https://qoj.ac/');
  const dashboard=isQoj?qojDashboard(location.href):dashboardFromUrl(location.href);
  if(!dashboard)try{if(isQoj)qojTarget(location.href);else problemFromUrl(location.href);}catch{return;}
  // An old isolated world can outlive an extension reload. It must release
  // the key before stopImmediatePropagation so the fresh listener can run.
  try{if(!ojBrowser?.runtime?.id){window.removeEventListener('keydown',onKey,true);return;}}
  catch{window.removeEventListener('keydown',onKey,true);return;}
  event.preventDefault();event.stopImmediatePropagation();if(busy)return;busy=true;
  const startedAt=dashboard?pressedAt:undefined;
  show('正在添加…');
  try{
   if(isQoj){
    show(dashboard?'正在添加 QOJ 比赛全部题目、PDF 和样例…':'正在添加 QOJ 题面、PDF 和样例…');
    const data=await waitForAdd(ojBrowser.runtime.sendMessage(dashboard?{action:'qoj-add',startedAt}:{action:'qoj-add'}),dashboard?900000:120000);
    if(!data||data.error)throw Error(data?.error||'QOJ 添加失败。');show(qojAdditionSummary(data));return;
   }
   if(dashboard){
    show('正在添加比赛全部题目及样例…');
    const data=await waitForAdd(ojBrowser.runtime.sendMessage({action:'cfhelper-add-dashboard',startedAt,problems:readDashboard(document,location.href)}),240000);
    if(!data||data.error)throw Error(data?.error||'批量创建失败');
    show('更新完成'+(data.mappingOnly?'':'\n'+data.files.map(file=>file.name+' → '+file.defaultProblem+'（'+file.sampleCount+' 组样例）').join('\n'))+importSummary(data)+autoOpenSummary(data));return;
   }
   const data=await waitForAdd(ojBrowser.runtime.sendMessage({action:'cfhelper-add-problem'}),120000);
   if(!data||data.error)throw Error(data?.error||'添加失败，请刷新题目页后重试。');
   if(data.mappingOnly||data.sourcePreserved){show('更新完成'+importSummary(data)+autoOpenSummary(data));return;}
   show('更新完成\n'+(data.existed?(data.name||'A.cpp')+' 已覆盖并写入初始内容，默认提交题号已更新。':'已新建 '+(data.name||'A.cpp')+'，已写入初始内容并更新默认提交题号。')+'\n默认提交题号：'+data.defaultProblem+'\n文件路径：'+data.path+'\n已追加样例：'+(data.sampleCount||0)+' 组'+importSummary(data)+autoOpenSummary(data));
  }catch(e){
   if(/extension context invalidated/i.test(e.message)){
    window.removeEventListener('keydown',onKey,true);
    show('扩展已更新，请刷新此题目页一次，再按 Shift+N。');
   }else show('添加失败：'+e.message);
  }finally{busy=false;}
 };
 onKey.progress=progress;globalThis.__cfhelperShortcut=onKey;
 window.addEventListener('keydown',onKey,true);
})();
