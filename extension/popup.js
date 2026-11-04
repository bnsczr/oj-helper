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
  if(dashboard){
   status.textContent='正在添加比赛全部题目及样例…';
   await chrome.scripting.executeScript({target:{tabId:tab.id},files:['problem.js','dashboard.js']});
   const listed=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readDashboard});
   const data=await waitForAdd(chrome.runtime.sendMessage({action:'cfhelper-add-dashboard',tabId:tab.id,problems:listed[0]?.result}),150000);
   if(!data||data.error)throw Error(data?.error||'批量创建失败');
   status.textContent='更新完成\n'+data.files.map(file=>file.name+' → '+file.defaultProblem+'（'+file.sampleCount+' 组样例）').join('\n')+autoOpenSummary(data);return;
  }
  const name=problemFromUrl(tab?.url);
  const {bridgeSecret,directory,initialContent,openAfterAdd}=await chrome.storage.local.get(['bridgeSecret','directory','initialContent','openAfterAdd']);
  if(!directory?.trim())throw Error('尚未设置保存目录，请点击下方按钮设置。');
  if(!bridgeSecret)throw Error('尚未配对，请在设置中完成配对。');
  status.textContent=`正在添加：分配文件，并将默认题号更新为 ${name.replace(/\.cpp$/,'')}…`;
  status.textContent='正在添加：读取全部样例…';
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readSamples});
  const samples=results[0]?.result;
  if(!Array.isArray(samples)||!samples.length)throw Error('未读取到题目样例，请刷新题目页后重试。');
  const statements=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readStatement});
  const statement=statements[0]?.result;
  if(typeof statement!=='string'||!statement.trim())throw Error('未读取到完整题面，请刷新题目页后重试。');
  let data;
  try{data=await waitForAdd(chrome.runtime.sendNativeMessage('com.codeforces_helper.local',{action:'create',secret:bridgeSecret,url:tab.url,directory,initialContent,samples,statement,openAfterAdd:openAfterAdd||{}}));}
  catch(e){if(e.message.includes('响应超时'))throw e;throw Error('尚未连接本机助手。只需在终端运行一次：\nsubmit --install-native '+chrome.runtime.id+'\n然后重新点击 +；无需保持终端运行。');}
  if(!data||data.error)throw Error(data?.error||'创建失败');
  status.textContent='更新完成\n'+(data.existed?(data.name||'A.cpp')+' 已覆盖并写入初始内容，默认提交题号已更新。\n':'已新建 '+(data.name||'A.cpp')+'，已写入初始内容并更新默认提交题号。\n')+'默认提交题号：'+data.defaultProblem+'\n文件路径：'+data.path+'\n已追加样例：'+samples.length+' 组'+autoOpenSummary(data);
 }catch(e){status.textContent=e.message;}
})();
