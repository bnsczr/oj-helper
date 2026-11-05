async function qojScript(options,timeout=15000){
 let timer;try{return await Promise.race([chrome.scripting.executeScript(options),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('QOJ 页面脚本读取超时，请激活对应标签页并检查扩展访问权限后重试。')),timeout);})]);}finally{clearTimeout(timer);}
}
async function qojReadTab(tabId,func,args=[],timeout=60000){
 const deadline=Date.now()+timeout;let attention=false;
 while(Date.now()<deadline){
  const tab=await chrome.tabs.get(tabId);
  if(tab.status==='complete'){
   await qojScript({target:{tabId},files:['qoj.js','qoj-page.js']});
   const replies=await qojScript({target:{tabId},func,args});const result=replies[0]?.result;
   if(result?.error)throw Error(result.error);
   if(result&&!result.waiting)return result;
   if(result?.challenge&&!attention){attention=true;await chrome.tabs.update(tabId,{active:true});}
  }
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw Error('QOJ 页面读取超时，请检查登录、网页验证或比赛访问权限。');
}
async function qojResource(url,problem,type){
 if(!url)return null;
 const parsed=new URL(url);
 if(parsed.origin!=='https://qoj.ac'||parsed.username||parsed.password||parsed.pathname!=='/download.php'||parsed.searchParams.get('id')!==problem||parsed.searchParams.get('type')!==type)throw Error('QOJ 附件网址与题目不匹配。');
 const response=await fetch(parsed.href,{credentials:'include',signal:AbortSignal.timeout(30000)});
 if(!response.ok||new URL(response.url||url).pathname==='/login'||/text\/html/i.test(response.headers.get('content-type')||''))throw Error('QOJ 附件下载需要登录或网页验证，请在浏览器完成后重试。');
 if(Number(response.headers.get('content-length'))>16*1024*1024)throw Error('QOJ 单个附件超过 16 MiB。');
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>16*1024*1024)throw Error('QOJ 单个附件超过 16 MiB。');
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return {url:parsed.href,base64:btoa(binary)};
}
async function qojCollectProblem(tabId,expected){
 const result=await qojReadTab(tabId,value=>{try{if(qojTarget(location.href).url!==qojTarget(value).url)return {waiting:true};}catch{return {waiting:true};}return readQojProblemPage();},[expected]),problem=result.problem,target=qojTarget(problem.url);
 problem.pdf=await qojResource(problem.pdfUrl,target.problem,'statement');
 problem.attachment=await qojResource(problem.attachmentUrl,target.problem,'problem');
 delete problem.pdfUrl;delete problem.attachmentUrl;return problem;
}
async function qojAddFromTab(tabId,url){
 const dashboard=qojDashboard(url);if(!dashboard)qojTarget(url);
 const settings=await chrome.storage.local.get(['bridgeSecret','directory','initialContent','openAfterAdd']);
 if(!settings.directory?.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');if(!settings.bridgeSecret)throw Error('尚未配对，请在设置中完成配对。');
 let reader,request;
 try{
  if(dashboard){
   const listed=await qojReadTab(tabId,readQojDashboard);
   reader=await chrome.tabs.create({active:false,url:listed.problems[0].url});const problems=[];
   for(let i=0;i<listed.problems.length;i++){
    const item=listed.problems[i];if(i)await chrome.tabs.update(reader.id,{url:item.url});
    const problem=await qojCollectProblem(reader.id,item.url);if(problem.url!==item.url)throw Error('QOJ 后台页面题号不匹配，未覆盖文件。');
    problems.push({...problem,index:item.index});
   }
   request={action:'qoj-create-dashboard',url:dashboard.url,problems};
  }else request={action:'qoj-create',url,problem:await qojCollectProblem(tabId,url)};
  const message={...request,secret:settings.bridgeSecret,directory:settings.directory,initialContent:settings.initialContent,openAfterAdd:settings.openAfterAdd||{}};
  if(JSON.stringify(message).length>60*1024*1024)throw Error('QOJ 整场附件超过本机消息上限，未覆盖文件。请分题添加。');
  let result;try{result=await chrome.runtime.sendNativeMessage('com.codeforces_helper.local',message);}catch{throw Error('QOJ 文件助手需要更新，请运行 submit --install-native '+chrome.runtime.id);}
  if(!result||result.error)throw Error(result?.error||'QOJ 文件创建失败。');return result;
 }finally{if(reader?.id)await chrome.tabs.remove(reader.id).catch(()=>{});}
}
async function openQojStandingsTab(task){
 const tab=await chrome.tabs.create({active:true,url:'https://qoj.ac/contest/'+task.contest});
 const dashboard=await qojReadTab(tab.id,readQojDashboard);
 if(!dashboard.extraUrl)throw Error('本场比赛没有可读取的 Extra/External Standings 入口，已有榜单文件未覆盖。');
 await chrome.tabs.update(tab.id,{active:true,url:dashboard.extraUrl});
 const result=await qojReadTab(tab.id,readQojExternalStandings,[{contest:task.contest}],120000);return result.snapshot;
}
function qojAdditionSummary(data){
 const files=data.files||[data];
 return '更新完成\n'+files.map(file=>file.name+' → '+file.defaultProblem+(data.emptySource?'（空白）':'（'+file.sampleCount+' 组样例）')).join('\n')+(data.warnings?.length?'\n'+data.warnings.join('\n'):'')+autoOpenSummary({...data,warnings:[]});
}
