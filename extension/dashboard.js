function readDashboard(root=document,value=location.href){
 const dashboard=dashboardFromUrl(value);if(!dashboard)throw Error('当前页面不是比赛 Dashboard。');
 const seen=new Set(),problems=[];
 for(const link of root.querySelectorAll('table.problems a[href]')){
  const url=new URL(link.getAttribute('href'),dashboard.url);
  const match=new RegExp('^/'+dashboard.section+'/'+dashboard.contest+'/problem/([a-z]\\d*)/?$','i').exec(url.pathname);
  if(url.origin!==new URL(dashboard.url).origin||!match)continue;
  const index=match[1].toUpperCase();if(seen.has(index))continue;seen.add(index);problems.push(index);
 }
 if(!problems.length)throw Error('未读取到比赛题目列表，请等待 Dashboard 加载完成后重试。');
 return problems;
}
function readContestSamples(indices,dashboard,index){
 const challenge=/just a moment|attention required|security verification/i.test(document.title)
  ||!!document.querySelector?.('#challenge-running, #challenge-stage');
 if(challenge)return {waiting:true,challenge:true};
 const suffix=index?'/problem/'+index:'/problems';
 if(!['https://codeforces.com','https://www.codeforces.com'].includes(location.origin)
    ||location.pathname.replace(/\/$/,'')!=='/'+dashboard.section+'/'+dashboard.contest+suffix
    ||document.readyState==='loading'
    ||typeof readSamples!=='function'||typeof readStatement!=='function')return {waiting:true};
 const statements=Array.from(document.querySelectorAll('.problem-statement'));
 const problems=[];
 for(const problem of indices){
  const matchesTitle=node=>new RegExp('^'+problem+'[.．]\\s*','i').test(node.querySelector('.header .title, .title')?.textContent.trim()||'');
  const statement=statements.find(matchesTitle)||(index&&statements.length===1?statements[0]:null);
  if(!statement?.querySelector('.header .title, .title')?.textContent.trim())continue;
  problems.push({index:problem,samples:readSamples(statement,true),statement:readStatement(statement,dashboard.url+'/problem/'+problem)});
 }
 return {problems};
}
async function cfPdfStatement(value,secret){
 const url=new URL(value);
 if(!['https://codeforces.com','https://www.codeforces.com'].includes(url.origin)||url.username||url.password)return null;
 const response=await fetch(url.href,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok||!/^application\/pdf\b/i.test(response.headers.get('content-type')||''))return null;
 const limit=16*1024*1024;
 if(Number(response.headers.get('content-length'))>limit)throw Error('PDF 题面超过 16 MiB。');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.length;if(size>limit)throw Error('PDF 题面超过 16 MiB。');
   for(let offset=0;offset<value.length;offset+=32768)chunks.push(String.fromCharCode(...value.subarray(offset,offset+32768)));
  }
 }finally{await reader.cancel().catch(()=>{});}
 return importNative({action:'pdf-statement',secret,url:url.href,base64:btoa(chunks.join(''))});
}
async function importNative(message){
 let result;
 try{result=await chrome.runtime.sendNativeMessage('com.codeforces_helper.local',message);}
 catch{throw Error('尚未连接本机助手，请运行 submit --install-native '+chrome.runtime.id);}
 if(!result||result.error)throw Error(result?.error||'本机助手未响应。');
 return result;
}
function notifyImportProgress(tabId,text){
 const message={action:'oj-import-progress',tabId,text};
 chrome.tabs.sendMessage?.(tabId,message)?.catch(()=>{});
 chrome.runtime.sendMessage?.(message)?.catch(()=>{});
}
function importSummary(data){
 const result=[];
 if(data.mappingOnly||data.statementRead?.length)result.push('提交映射已建立：'+(data.files||[data]).map(file=>file.name).join('、'));
 if(data.statementRead?.length)result.push('题面读取成功：'+data.statementRead.join('、'));
 if(data.statementFailed?.length)result.push('题面未读全：'+data.statementFailed.join('；'));
 return result.length?'\n'+result.join('\n'):'';
}
async function completeMappedImport(mapping,common,problems,missing,statement,contests){
 if(statement)try{await importNative({...common,action:'cache-import',importId:mapping.importId,statement,contests});}
 catch(error){missing.push(error.message);}
 return {...mapping,statementRead:problems,statementFailed:missing};
}
async function createCfProblem(tabId,url,message){
 const {bridgeSecret,directory,initialContent,openAfterAdd}=await chrome.storage.local.get(['bridgeSecret','directory','initialContent','openAfterAdd']);
 if(!directory?.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');
 if(!bridgeSecret)throw Error('尚未配对，请在扩展设置中完成配对。');
 const common={oj:'cf',url,directory,secret:bridgeSecret};
 const mapping=await importNative({...common,action:'prepare-import',earlyMapping:true,openAfterAdd});
 if(mapping.mappingOnly||mapping.importId)notifyImportProgress(tabId,'提交映射已建立，正在读取题面…');
 let {statement,samples}=message,partial=false;
 try{
  if(!statement){
   try{
    const [result]=await chrome.scripting.executeScript({target:{tabId},func:()=>({statement:readStatement(),samples:readSamples(document,true)})});
    ({statement,samples}=result.result);
   }catch{
    const pdf=await cfPdfStatement(url,bridgeSecret);
    if(!pdf)throw Error('无法读取题面，请刷新题目页后重试。');
    ({statement,samples}=pdf);partial=!pdf.complete;
   }
  }
 }catch(error){
  if(!mapping.mappingOnly&&!mapping.importId)throw error;
  return {...mapping,mappingOnly:true,statementFailed:[error.message]};
 }
 const read=partial?[]:['当前题目'],missing=partial?['PDF 无法提取文字，请查看原件']:[];
 if(mapping.mappingOnly)return completeMappedImport(mapping,common,read,missing,statement);
 const data=await importNative({...common,action:'create',finishId:mapping.importId,initialContent,samples,statement,openAfterAdd:openAfterAdd||{}});
 return {...data,statementRead:read,statementFailed:missing};
}
async function readDashboardTab(tabId,indices,dashboard,index,deadline,secret){
 let until=Math.min(deadline,Date.now()+(index?18000:6000)),asked=false;
 const pdfAt=Date.now()+1500;
 let triedPdf=false;
 while(Date.now()<until){
  let timer,result;
  try{
   // The document can be ready while large images keep the browser tab loading.
   // Read from the existing content scripts without waiting for the window load event.
   const results=await Promise.race([
    chrome.scripting.executeScript({target:{tabId},func:readContestSamples,args:[indices,dashboard,index],injectImmediately:true}),
    new Promise(resolve=>{timer=setTimeout(()=>resolve([]),Math.min(2000,until-Date.now()));})
   ]);
   result=results[0]?.result;
  }catch{
   // A navigation in progress can temporarily make the page unavailable.
  }finally{clearTimeout(timer);}
  if(result?.problems&&(!index||result.problems.length))return result.problems;
  if(result?.challenge&&!asked){
   await chrome.tabs.update(tabId,{active:true});
   asked=true;
   until=Math.min(deadline,Date.now()+90000);
  }
  if(index&&!result?.challenge&&!triedPdf&&(result?.problems||Date.now()>=pdfAt)){
   triedPdf=true;
   const pdf=await cfPdfStatement(dashboard.url+'/problem/'+index,secret).catch(error=>({error:error.message}));
   if(pdf?.error)throw Error(index+' 题 PDF 读取失败：'+pdf.error);
   if(pdf)return [{index,samples:pdf.samples,statement:'# '+index+'\n\n'+pdf.statement,partial:!pdf.complete}];
  }
  await new Promise(resolve=>setTimeout(resolve,350));
 }
 if(asked)throw Error('网页验证未完成，未覆盖文件。');
 if(index)throw Error('无法读取 '+index+' 题题面，未覆盖文件。请检查该题是否能在浏览器打开。');
 return [];
}
async function createDashboardFiles(tabId,url,indices,startedAt){
 const dashboard=dashboardFromUrl(url);
 if(!dashboard||!Array.isArray(indices)||!indices.length||indices.some(index=>! /^[A-Z]\d*$/.test(index))||new Set(indices).size!==indices.length)throw Error('比赛题目列表无效。');
 const {bridgeSecret,directory,initialContent,openAfterAdd}=await chrome.storage.local.get(['bridgeSecret','directory','initialContent','openAfterAdd']);
 if(!directory?.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');if(!bridgeSecret)throw Error('尚未配对，请在设置中完成配对。');
 const common={oj:'cf',secret:bridgeSecret,directory,url:dashboard.url};
 const mapping=await importNative({...common,action:'prepare-import',earlyMapping:true,startedAt,openAfterAdd,problems:indices.map(index=>({index}))});
 if(mapping.mappingOnly||mapping.importId)notifyImportProgress(tabId,'提交映射已建立，正在读取题面…');
 let reader;
 const problems=[],missing=[];
 try{
  const deadline=Date.now()+210000;
  reader=await chrome.tabs.create({active:false,url:dashboard.url+'/problems'});
  const aggregate=await readDashboardTab(reader.id,indices,dashboard,null,deadline,bridgeSecret);
  const available=new Map(aggregate.map(problem=>[problem.index,problem]));
  for(const index of indices){
   const cached=available.get(index);
   if(cached&&cached.samples!==null){problems.push(cached);continue;}
   try{
    if(Date.now()>=deadline)throw Error('达到整场导入时限');
    await chrome.tabs.update(reader.id,{url:dashboard.url+'/problem/'+index});
    const [problem]=await readDashboardTab(reader.id,[index],dashboard,index,deadline,bridgeSecret);
    problems.push(problem);
   }catch(error){
    if(!mapping.mappingOnly)throw error;
    missing.push(index+'（'+error.message+'）');
   }
  }
 }catch(error){
  if(!mapping.mappingOnly){
   if(!mapping.importId)throw error;
   return {...mapping,mappingOnly:true,statementFailed:[error.message]};
  }
  missing.push(error.message);
 }
 finally{if(reader?.id)await chrome.tabs.remove(reader.id).catch(()=>{});}
 const read=problems.filter(problem=>!problem.partial).map(problem=>problem.index);
 for(const problem of problems.filter(problem=>problem.partial))missing.push(problem.index+'（PDF 无法提取文字，请查看原件）');
 if(mapping.mappingOnly){
  const statements=new Map(problems.map(problem=>[problem.index,problem.statement]));
  const statement=problems.length?'# Codeforces '+dashboard.contest+'\n\n'+indices.map(index=>statements.get(index)||'## '+index+'\n\n[题面未读取]('+dashboard.url+'/problem/'+index+')').join('\n\n---\n\n'):null;
  return completeMappedImport(mapping,common,read,missing,statement);
 }
 const data=await importNative({...common,action:'create-dashboard',finishId:mapping.importId,initialContent,problems,openAfterAdd:openAfterAdd||{}});
 return {...data,statementRead:read,statementFailed:missing};
}
if(typeof module!=='undefined')module.exports={readDashboard,readContestSamples};
