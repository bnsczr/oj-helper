function waitForAdd(request,duration=30000){
 let timer;
 const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('本机助手响应超时；请检查文件及默认题号后再操作，避免重复添加。')),duration);});
 return Promise.race([request,timeout]).finally(()=>clearTimeout(timer));
}
document.querySelector('#settings').onclick=()=>chrome.runtime.openOptionsPage();
(async()=>{
 const status=document.querySelector('#status');
 status.textContent='正在添加…';
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const dashboard=dashboardFromUrl(tab?.url);
  chrome.runtime.onMessage?.addListener(message=>{if(message.action==='oj-import-progress'&&message.tabId===tab?.id)status.textContent=message.text;});
  if(tab?.url?.startsWith('https://qoj.ac/')){
   status.textContent='正在添加：读取 QOJ 题面、PDF 及样例附件…';
   const data=await waitForAdd(chrome.runtime.sendMessage({action:'qoj-add',tabId:tab.id}),900000);
   if(!data||data.error)throw Error(data?.error||'QOJ 添加失败。');status.textContent=qojAdditionSummary(data);return;
  }
  if(dashboard){
   status.textContent='正在添加比赛全部题目及样例…';
   await chrome.scripting.executeScript({target:{tabId:tab.id},files:['problem.js','dashboard.js']});
   const listed=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readDashboard});
   const data=await waitForAdd(chrome.runtime.sendMessage({action:'cfhelper-add-dashboard',tabId:tab.id,problems:listed[0]?.result}),240000);
   if(!data||data.error)throw Error(data?.error||'批量创建失败');
   status.textContent='更新完成'+(data.mappingOnly?'':'\n'+data.files.map(file=>file.name+' → '+file.defaultProblem+'（'+file.sampleCount+' 组样例）').join('\n'))+importSummary(data)+autoOpenSummary(data);return;
  }
  problemFromUrl(tab?.url);
  const data=await waitForAdd(chrome.runtime.sendMessage({action:'cfhelper-add-problem',tabId:tab.id}),120000);
  if(!data||data.error)throw Error(data?.error||'创建失败');
  if(data.mappingOnly||data.sourcePreserved){status.textContent='更新完成'+importSummary(data)+autoOpenSummary(data);return;}
  status.textContent='更新完成\n'+(data.existed?(data.name||'A.cpp')+' 已覆盖并写入初始内容，默认提交题号已更新。\n':'已新建 '+(data.name||'A.cpp')+'，已写入初始内容并更新默认提交题号。\n')+'默认提交题号：'+data.defaultProblem+'\n文件路径：'+data.path+'\n已追加样例：'+(data.sampleCount||0)+' 组'+importSummary(data)+autoOpenSummary(data);
 }catch(e){status.textContent=e.message;}
})();
