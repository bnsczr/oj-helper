var ojBrowser=globalThis.browser??globalThis.chrome;
async function qojScript(options,timeout=15000){
 let timer;try{return await Promise.race([ojBrowser.scripting.executeScript(options),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('QOJ 页面脚本读取超时，请激活对应标签页并检查扩展访问权限后重试。')),timeout);})]);}finally{clearTimeout(timer);}
}
async function qojReadTab(tabId,func,args=[],timeout=60000,whileLoading=false){
 const deadline=Date.now()+timeout;let attention=false;
 while(Date.now()<deadline){
  const tab=await ojBrowser.tabs.get(tabId);
  if(whileLoading||tab.status==='complete'){
   await qojScript({target:{tabId},files:['qoj.js','qoj-page.js'],injectImmediately:whileLoading});
   const replies=await qojScript({target:{tabId},func,args,injectImmediately:whileLoading});const result=replies[0]?.result;
   if(result?.error)throw Error(result.error);
   if(result&&!result.waiting)return result;
   if(result?.challenge&&!attention){attention=true;await ojBrowser.tabs.update(tabId,{active:true});}
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
async function qojAddFromTab(tabId,url,startedAt){
 const dashboard=qojDashboard(url);if(!dashboard)qojTarget(url);
 const settings=await ojBrowser.storage.local.get(['bridgeSecret','directory','initialContent','openAfterAdd']);
 if(!settings.directory?.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');if(!settings.bridgeSecret)throw Error('尚未配对，请在设置中完成配对。');
 const common={oj:'qoj',secret:settings.bridgeSecret,directory:settings.directory,url};
 const listed=dashboard?await qojReadTab(tabId,readQojDashboard,[],60000,true):null;
 const items=listed?.problems||[{url,index:null}];
 if(!dashboard){
  const title=await qojScript({target:{tabId},injectImmediately:true,func:()=>document.querySelector('h1.text-center, h1.col-md-7, .problem-title')?.textContent.trim()},2000).catch(()=>[]);
  items[0].title=title[0]?.result;
 }
 const mapping=await importNative({...common,action:'prepare-import',earlyMapping:true,openAfterAdd:settings.openAfterAdd,...(dashboard?{problems:items,startedAt}:{title:items[0].title})});
 if(mapping.mappingOnly||mapping.importId)notifyImportProgress(tabId,'提交映射已建立，正在读取题面…');
 let reader,request;
 try{
  if(mapping.mappingOnly){
   const read=[],missing=[],statements=[];let contests;
   for(const item of items){
    const label=item.index||qojTarget(item.url).problem;
    try{
     if(dashboard){
      if(!reader)reader=await ojBrowser.tabs.create({active:false,url:item.url});
      else await ojBrowser.tabs.update(reader.id,{url:item.url});
     }
     const problem=await qojCollectProblem(reader?.id||tabId,item.url);
     const result=await importNative({...common,action:'qoj-import-statement',problem});
     statements.push(result.statement);contests=result.contests;
     if(result.complete)read.push(label);else missing.push(label+'（PDF 无法提取文字，请查看原件）');
    }catch(error){
     missing.push(label+'（'+error.message+'）');
     statements.push('## '+label+'\n\n[题面未读取]('+item.url+')');
    }
   }
   return completeMappedImport(mapping,common,read,missing,read.length||statements.some(text=>!text.includes('[题面未读取]'))?statements.join('\n\n---\n\n'):null,dashboard?undefined:contests);
  }
  if(dashboard){
   reader=await ojBrowser.tabs.create({active:false,url:listed.problems[0].url});const problems=[];
   for(let i=0;i<listed.problems.length;i++){
    const item=listed.problems[i];if(i)await ojBrowser.tabs.update(reader.id,{url:item.url});
    const problem=await qojCollectProblem(reader.id,item.url);if(problem.url!==item.url)throw Error('QOJ 后台页面题号不匹配，未覆盖文件。');
    problems.push({...problem,index:item.index});
   }
   request={action:'qoj-create-dashboard',url:dashboard.url,problems};
  }else request={action:'qoj-create',url,problem:await qojCollectProblem(tabId,url)};
  const message={...request,finishId:mapping.importId,secret:settings.bridgeSecret,directory:settings.directory,initialContent:settings.initialContent,openAfterAdd:settings.openAfterAdd||{}};
  if(JSON.stringify(message).length>60*1024*1024)throw Error('QOJ 整场附件超过本机消息上限，未覆盖文件。请分题添加。');
  let result;try{result=await ojBrowser.runtime.sendNativeMessage('com.codeforces_helper.local',message);}catch{throw Error('QOJ 文件助手需要更新，请运行 submit --install-native '+ojBrowser.runtime.id);}
  if(!result||result.error)throw Error(result?.error||'QOJ 文件创建失败。');
  return {...result,statementRead:dashboard?items.map(item=>item.index):[qojTarget(url).problem]};
 }catch(error){
  if(!mapping.importId)throw error;
  return {...mapping,mappingOnly:true,statementFailed:[error.message]};
 }finally{if(reader?.id)await ojBrowser.tabs.remove(reader.id).catch(()=>{});}
}
async function openQojStandingsTab(task){
 const tab=await ojBrowser.tabs.create({active:true,url:'https://qoj.ac/contest/'+task.contest});
 const dashboard=await qojReadTab(tab.id,readQojDashboard);
 if(!dashboard.extraUrl)throw Error('本场比赛没有可读取的 Extra/External Standings 入口，已有榜单文件未覆盖。');
 await ojBrowser.tabs.update(tab.id,{active:true,url:dashboard.extraUrl});
 const result=await qojReadTab(tab.id,readQojExternalStandings,[{contest:task.contest}],120000);return result.snapshot;
}
function qojAdditionSummary(data){
 if(data.mappingOnly)return '更新完成'+importSummary(data)+autoOpenSummary(data);
 const files=data.files||[data];
 return '更新完成\n'+files.map(file=>file.name+' → '+file.defaultProblem+'（'+file.sampleCount+' 组样例）').join('\n')+importSummary(data)+(data.warnings?.length?'\n'+data.warnings.join('\n'):'')+autoOpenSummary({...data,warnings:[]});
}
