function readDashboard(root=document,value=location.href){
 const dashboard=dashboardFromUrl(value);if(!dashboard)throw Error('当前页面不是比赛 Dashboard。');
 const seen=new Set(),problems=[];
 for(const link of root.querySelectorAll('table.problems a[href]')){
  const url=new URL(link.getAttribute('href'),dashboard.url);
  const match=new RegExp('^/contest/'+dashboard.contest+'/problem/([a-z]\\d*)/?$','i').exec(url.pathname);
  if(url.origin!==new URL(dashboard.url).origin||!match)continue;
  const index=match[1].toUpperCase();if(seen.has(index))continue;seen.add(index);problems.push(index);
 }
 if(!problems.length)throw Error('未读取到比赛题目列表，请等待 Dashboard 加载完成后重试。');
 return problems;
}
function readContestSamples(indices){
 const statements=Array.from(document.querySelectorAll('.problem-statement'));
 if(!statements.length)return {waiting:true,challenge:/just a moment|attention required|security verification/i.test(document.title)};
 const problems=indices.map(index=>{
  const statement=statements.find(node=>new RegExp('^'+index+'\\.\\s','i').test(node.querySelector('.header .title, .title')?.textContent.trim()||''));
  if(!statement)throw Error('所有题目页缺少 '+index+' 题，未覆盖文件。');
  return {index,samples:readSamples(statement),statement:readStatement(statement,new URL('/contest/'+location.pathname.split('/')[2]+'/problem/'+index,location.href).href)};
 });
 return {problems};
}
async function createDashboardFiles(tabId,url,indices){
 const dashboard=dashboardFromUrl(url);
 if(!dashboard||!Array.isArray(indices)||!indices.length||indices.some(index=>! /^[A-Z]\d*$/.test(index))||new Set(indices).size!==indices.length)throw Error('比赛题目列表无效。');
 const {bridgeSecret,directory,initialContent,openAfterAdd}=await chrome.storage.local.get(['bridgeSecret','directory','initialContent','openAfterAdd']);
 if(!directory?.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');if(!bridgeSecret)throw Error('尚未配对，请在设置中完成配对。');
 let reader;
 try{
  reader=await chrome.tabs.create({active:false,url:dashboard.url+'/problems'});
  for(let attempt=0;attempt<120;attempt++){
   const tab=await chrome.tabs.get(reader.id);
   if(tab.status==='complete'){
    await chrome.scripting.executeScript({target:{tabId:reader.id},files:['samples.js','statement.js','dashboard.js']});
    const results=await chrome.scripting.executeScript({target:{tabId:reader.id},func:readContestSamples,args:[indices]});
    const result=results[0]?.result;
    if(result?.problems){
     const data=await chrome.runtime.sendNativeMessage('com.codeforces_helper.local',{action:'create-dashboard',secret:bridgeSecret,directory,initialContent,url:dashboard.url,problems:result.problems,openAfterAdd:openAfterAdd||{}});
     if(!data||data.error)throw Error(data?.error||'批量创建失败');return data;
    }
    if(result?.challenge)await chrome.tabs.update(reader.id,{active:true});
   }
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw Error('读取全部题目超时，未覆盖文件；请检查比赛访问权限或网页验证。');
 }finally{if(reader?.id)await chrome.tabs.remove(reader.id).catch(()=>{});}
}
if(typeof module!=='undefined')module.exports={readDashboard,readContestSamples};
