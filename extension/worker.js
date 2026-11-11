var ojBrowser=globalThis.browser??globalThis.chrome;
if(typeof importScripts==='function')importScripts('qoj.js','qoj-page.js','qoj-worker.js','problem.js','dashboard.js','standings.js');
let lastSubmissionKey;
async function openSubmissionTask(task,url){
  const token=task.key.split(':')[1];
  const duplicate=lastSubmissionKey===task.key;
  lastSubmissionKey=task.key;
  await fetch('http://127.0.0.1:27121/claim?token='+token,{method:'POST',signal:AbortSignal.timeout(700)}).catch(()=>{});
  if(duplicate)return;
  try{await ojBrowser.tabs.create({active:false,url});}
  catch(error){
    const result={message:'无法打开提交页面：'+error.message,final:true,ok:false};
    await fetch('http://127.0.0.1:27121/result?token='+token,{method:'POST',body:JSON.stringify(result),signal:AbortSignal.timeout(700)});
  }
}
async function poll(){
  try{
    const {bridgeSecret}=await ojBrowser.storage.local.get('bridgeSecret');if(!bridgeSecret)return;
    const r=await fetch('http://127.0.0.1:27121/pending',{headers:{Authorization:`Bearer ${bridgeSecret}`,'X-Oj-Helper-Platforms':'cf,qoj','X-Oj-Helper-Contest-Mode':'1','X-Oj-Helper-Gym':'1','X-Oj-Helper-Receipt':'1'},cache:'no-store',signal:AbortSignal.timeout(900)});if(!r.ok)return;
    const task=await r.json();if(!/^27121:[a-f0-9]{48}$/.test(task.key))return;
    if(task.oj==='qoj'&&task.action==='qoj-inspect'){
      const pages=[];const tabs=await ojBrowser.tabs.query({url:'https://qoj.ac/*'});
      for(const tab of tabs){try{await fetch('http://127.0.0.1:27121/result?token='+task.key.split(':')[1],{method:'POST',body:JSON.stringify({message:'正在读取页面结构：'+tab.url})});const result=await qojScript({target:{tabId:tab.id},func:inspectQojPage});if(result[0]?.result)pages.push(result[0].result);}catch(error){pages.push({url:tab.url,error:error.message});}}
      await fetch('http://127.0.0.1:27121/result?token='+task.key.split(':')[1],{method:'POST',body:JSON.stringify({message:'已读取 QOJ 页面结构',pages,final:true,ok:pages.length>0}),signal:AbortSignal.timeout(4000)});return;
    }
    if(task.oj==='qoj'&&task.action==='qoj-audit'){
      const pages=[],tabs=await ojBrowser.tabs.query({url:'https://qoj.ac/*'});let downloaded=false,reader;
      const urls=Array.from(new Set(tabs.map(tab=>tab.url).filter(Boolean)));
      try{for(const url of urls){
        try{
          if(reader)await ojBrowser.tabs.update(reader.id,{url,active:true});else reader=await ojBrowser.tabs.create({url,active:true});
          const tab={id:reader.id,url};
          await fetch('http://127.0.0.1:27121/result?token='+task.key.split(':')[1],{method:'POST',body:JSON.stringify({message:'正在核验 QOJ 读取器：'+tab.url})});
          const result=await qojReadTab(tab.id,expected=>{
            if(qojBlocked(document))return {error:'页面需要登录或验证'};
            if(location.pathname.replace(/\/$/,'')!==new URL(expected).pathname.replace(/\/$/,''))return {waiting:true};
            if(qojDashboard(location.href))return {dashboard:readQojDashboard()};
            if(/^\/submission\//.test(location.pathname))return {judgement:readQojJudgement()};
            if(/^\/results\//.test(location.pathname)){const link=Array.from(document.querySelectorAll('a[href]')).map(a=>{try{return qojDashboard(new URL(a.getAttribute('href'),location.href).href);}catch{return null;}}).find(Boolean);return link?readQojExternalStandings({contest:link.contest}):{error:'没有比赛链接'};}
            try{qojTarget(location.href);const page=readQojProblemPage(),source=qojSourceForm();if(source.form)page.sourceContract={base:source.base,radioValues:Array.from(source.form.querySelectorAll('input[type="radio"]')).map(input=>input.value),fileField:source.file?.name,editorField:source.editor?.name,languages:Array.from(source.language?.options||[]).map(option=>option.value)};return page;}catch{return {submissions:qojSubmissionRows()};}
          },[url]);
          if(result?.problem&&!downloaded){result.downloaded=await qojCollectProblem(tab.id,tab.url);downloaded=true;}
          pages.push({url:tab.url,result});
        }catch(error){pages.push({url,error:error.message});}
      }}finally{if(reader?.id)await ojBrowser.tabs.remove(reader.id).catch(()=>{});}
      await fetch('http://127.0.0.1:27121/result?token='+task.key.split(':')[1],{method:'POST',body:JSON.stringify({message:'QOJ 页面读取器核验已结束',pages,final:true,ok:pages.some(page=>page.result&&!page.result.error)}),signal:AbortSignal.timeout(10000)});return;
    }
    if(task.oj==='qoj'){
      if(task.contest!==null&&task.contest!==undefined&&!/^[1-9]\d*$/.test(task.contest))return;
      if(task.action==='open-standings'){
        let result;try{if(!task.contest)throw Error('QOJ 比赛编号缺失。');const standings=await openQojStandingsTab(task);result={message:'已读取 QOJ External Standings 完整榜单。',standings,final:true,ok:true};}catch(error){result={message:error.message,final:true,ok:false};}
        await fetch('http://127.0.0.1:27121/result?token='+task.key.split(':')[1],{method:'POST',body:JSON.stringify(result),signal:AbortSignal.timeout(4000)});return;
      }
      if(task.action||! /^[1-9]\d*$/.test(task.problem))return;
      await openSubmissionTask(task,'https://qoj.ac/'+(task.contest?'contest/'+task.contest+'/':'')+'submissions#qojhelper='+task.key);return;
    }
    if(! /^[1-9]\d*$/.test(task.contest))return;
    if(task.action==='open-standings'){
      if(!['contest','gym'].includes(task.section))return;
      let result;
      try{const standings=await openStandingsTab(task);result={message:'已读取 Friends standings 完整榜单。',standings,final:true,ok:true};}
      catch(e){result={message:'打开榜单失败：'+e.message,final:true,ok:false};}
      await fetch('http://127.0.0.1:27121/result?token='+task.key.split(':')[1],{method:'POST',body:JSON.stringify(result),signal:AbortSignal.timeout(4000)});return;
    }
    if(task.action||! /^[A-Z]\d*$/.test(task.problem))return;
    const section=task.section==='gym'?'gym':'contest';
    await openSubmissionTask(task,`https://codeforces.com/${section}/${task.contest}/my#cfhelper=${task.key}`);
  }catch{}
}
ojBrowser.alarms.create('cfhelper-poll',{periodInMinutes:0.5});
let wakePort=null,wakeConnecting=false,reconnectTimer,reconnectDelay=200;
function reconnectWakeup(){
  if(reconnectTimer)return;
  reconnectTimer=setTimeout(()=>{reconnectTimer=undefined;connectWakeup();},reconnectDelay);
  reconnectDelay=Math.min(reconnectDelay*2,30000);
}
async function connectWakeup(){
  if(!ojBrowser.runtime.connectNative||wakePort||wakeConnecting)return;
  wakeConnecting=true;
  try{
    const {bridgeSecret}=await ojBrowser.storage.local.get('bridgeSecret');if(!bridgeSecret)return;
    const port=ojBrowser.runtime.connectNative('com.codeforces_helper.local');wakePort=port;
    port.onMessage.addListener(message=>{
      if(wakePort!==port)return;
      if(message.event==='ready'||message.event==='bridge-ready'){reconnectDelay=200;poll();}
      else if(message.error){wakePort=null;port.disconnect();reconnectWakeup();}
    });
    port.onDisconnect.addListener(()=>{
      void ojBrowser.runtime.lastError;
      if(wakePort===port){wakePort=null;reconnectWakeup();}
    });
    port.postMessage({action:'watch',secret:bridgeSecret});
  }catch{
    if(wakePort){const old=wakePort;wakePort=null;try{old.disconnect();}catch{}}
    reconnectWakeup();
  }
  finally{wakeConnecting=false;}
}
ojBrowser.alarms.onAlarm.addListener(a=>{if(a.name==='cfhelper-poll'){poll();connectWakeup();}});
ojBrowser.storage.onChanged?.addListener((changes,area)=>{
  if(area==='local'&&changes.bridgeSecret){
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
    reconnectDelay=200;
    if(wakePort){const old=wakePort;wakePort=null;old.disconnect();}
    connectWakeup();poll();
  }
});
async function restoreShortcuts(){
  if(!ojBrowser.scripting?.executeScript||!ojBrowser.tabs?.query)return;
  const tabs=await ojBrowser.tabs.query({url:['https://codeforces.com/*','https://www.codeforces.com/*','https://qoj.ac/*']});
  await Promise.allSettled(tabs.filter(tab=>Number.isInteger(tab.id)).map(tab=>ojBrowser.scripting.executeScript({target:{tabId:tab.id},files:[...(tab.url?.startsWith('https://qoj.ac/')?['qoj.js','qoj-page.js','qoj-worker.js']:[]),'problem.js','samples.js','statement.js','open-settings.js','dashboard.js','shortcut.js']})));
}
function start(){poll();connectWakeup();restoreShortcuts().catch(()=>{});}
async function recoverAfterUpdate(details){
  const parts=details?.previousVersion?.split('.').map(Number);
  const legacy=parts&&parts[0]===1&&(parts[1]<5||(parts[1]===5&&parts[2]===0));
  if(details?.reason!=='update'||!legacy||!ojBrowser.scripting?.executeScript||!ojBrowser.tabs?.reload)return;
  const tabs=await ojBrowser.tabs.query({url:['https://codeforces.com/*','https://www.codeforces.com/*']});
  await Promise.allSettled(tabs.filter(tab=>Number.isInteger(tab.id)).map(async tab=>{
    const results=await ojBrowser.scripting.executeScript({target:{tabId:tab.id},func:()=>{
      if(!/^\/(?:problemset\/problem\/[1-9]\d*\/[a-z]\d*|(?:contest|gym)\/[1-9]\d*\/problem\/[a-z]\d*)\/?$/i.test(location.pathname))return false;
      const edited=[...document.querySelectorAll('input,textarea')].some(field=>field.type==='file'?field.files?.length:!['hidden','checkbox','radio','submit','button'].includes(field.type)&&field.value!==field.defaultValue);
      const editor=document.querySelector('[contenteditable="true"],.monaco-editor,.CodeMirror,.ace_editor');
      if(edited||editor){
        const notice=document.createElement('div');notice.textContent='扩展已更新：请保存页面输入并刷新此题目页一次，以恢复 Shift+N。';notice.style='position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff3cd;color:#111;padding:14px';document.documentElement.append(notice);return false;
      }
      return true;
    }});
    if(results[0]?.result===true)await ojBrowser.tabs.reload(tab.id);
  }));
}
ojBrowser.runtime.onStartup.addListener(start);
ojBrowser.runtime.onInstalled.addListener(details=>{start();recoverAfterUpdate(details).catch(()=>{});});start();
ojBrowser.runtime.onMessage.addListener((m,s,reply)=>{
  if(m.action==='qoj-add'){
    (async()=>{
      const source=s.tab||((s.url===ojBrowser.runtime.getURL('popup.html')&&Number.isInteger(m.tabId))?await ojBrowser.tabs.get(m.tabId):null);
      if(!source)throw Error('QOJ 添加来源无效。');
      const url=s.tab?s.url:source.url;if(!qojDashboard(url))qojTarget(url);
      return qojAddFromTab(source.id,url,s.tab?m.startedAt:undefined);
    })().then(reply).catch(error=>reply({error:error.message}));return true;
  }
  if(m.action==='cfhelper-add-dashboard'){
    (async()=>{
      const source=s.tab||((s.url===ojBrowser.runtime.getURL('popup.html')&&Number.isInteger(m.tabId))?await ojBrowser.tabs.get(m.tabId):null);
      if(!source)throw Error('批量操作来源无效。');
      const url=s.tab?s.url:source.url;
      return createDashboardFiles(source.id,url,m.problems,s.tab?m.startedAt:undefined);
    })().then(reply).catch(e=>reply({error:e.message}));return true;
  }
  if(m.action==='cfhelper-add-problem'){
    if(s.tab){
      try{problemFromUrl(s.url);}catch{return;}
    }else if(!Number.isInteger(m.tabId)||s.url!==ojBrowser.runtime.getURL('popup.html'))return;
    (async()=>{
      const source=s.tab||((s.url===ojBrowser.runtime.getURL('popup.html')&&Number.isInteger(m.tabId))?await ojBrowser.tabs.get(m.tabId):null);
      if(!source)throw Error('题目来源无效。');
      const url=s.tab?s.url:source.url;
      problemFromUrl(url);
      return createCfProblem(source.id,url,m);
    })().then(reply).catch(e=>reply({error:e.message}));return true;
  }
  if(m.poll&&s.url===ojBrowser.runtime.getURL('options.html')){poll();connectWakeup();reply({});return;}
  const qojSource=m.oj==='qoj'&&s.url?.startsWith('https://qoj.ac/');
  if((!qojSource&&!s.url?.startsWith('https://codeforces.com/'))||!/^27121:[a-f0-9]{48}$/.test(m.key))return;
  (async()=>{
    if(m.attention&&s.tab){await ojBrowser.tabs.update(s.tab.id,{active:true});await ojBrowser.windows.update(s.tab.windowId,{focused:true});}
    const [port,token]=m.key.split(':');
    const r=await fetch(`http://127.0.0.1:${port}/${m.result?'result':'job'}?token=${token}`,m.result?{method:'POST',body:JSON.stringify(m.result)}:{});
    if(!r.ok)throw Error('本机任务不存在或已领取');const data=await r.json();
    if(m.result?.final&&m.result?.ok&&s.tab)setTimeout(()=>ojBrowser.tabs.remove(s.tab.id).catch(()=>{}),500);
    return {data};
  })().then(reply).catch(e=>reply({error:e.message}));return true;
});
