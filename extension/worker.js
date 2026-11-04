if(typeof importScripts==='function')importScripts('problem.js','dashboard.js','standings.js');
async function poll(){
  try{
    const {bridgeSecret}=await chrome.storage.local.get('bridgeSecret');if(!bridgeSecret)return;
    const r=await fetch('http://127.0.0.1:27121/pending',{headers:{Authorization:`Bearer ${bridgeSecret}`},signal:AbortSignal.timeout(4000)});if(!r.ok)return;
    const task=await r.json();if(!/^27121:[a-f0-9]{48}$/.test(task.key)||! /^[1-9]\d*$/.test(task.contest))return;
    if(task.action==='open-standings'){
      if(!['contest','gym'].includes(task.section))return;
      let result;
      try{const standings=await openStandingsTab(task);result={message:'已读取 Friends standings 完整榜单。',standings,final:true,ok:true};}
      catch(e){result={message:'打开榜单失败：'+e.message,final:true,ok:false};}
      await fetch('http://127.0.0.1:27121/result?token='+task.key.split(':')[1],{method:'POST',body:JSON.stringify(result),signal:AbortSignal.timeout(4000)});return;
    }
    if(task.action||! /^[A-Z]\d*$/.test(task.problem))return;
    await chrome.tabs.create({active:false,url:`https://codeforces.com/problemset/status?my=on#cfhelper=${task.key}`});
  }catch{}
}
chrome.alarms.create('cfhelper-poll',{periodInMinutes:0.5});
let wakePort=null,wakeConnecting=false;
async function connectWakeup(){
  if(!chrome.runtime.connectNative||wakePort||wakeConnecting)return;
  wakeConnecting=true;
  try{
    const {bridgeSecret}=await chrome.storage.local.get('bridgeSecret');if(!bridgeSecret)return;
    const port=chrome.runtime.connectNative('com.codeforces_helper.local');wakePort=port;
    port.onMessage.addListener(message=>{
      if(wakePort!==port)return;
      if(message.event==='ready'||message.event==='bridge-ready')poll();
      else if(message.error){wakePort=null;port.disconnect();}
    });
    port.onDisconnect.addListener(()=>{void chrome.runtime.lastError;if(wakePort===port)wakePort=null;});
    port.postMessage({action:'watch',secret:bridgeSecret});
  }catch{if(wakePort){try{wakePort.disconnect();}catch{}wakePort=null;}}
  finally{wakeConnecting=false;}
}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='cfhelper-poll'){poll();connectWakeup();}});
chrome.storage.onChanged?.addListener((changes,area)=>{
  if(area==='local'&&changes.bridgeSecret){if(wakePort){const old=wakePort;wakePort=null;old.disconnect();}connectWakeup();poll();}
});
async function restoreShortcuts(){
  if(!chrome.scripting?.executeScript||!chrome.tabs?.query)return;
  const tabs=await chrome.tabs.query({url:['https://codeforces.com/*','https://www.codeforces.com/*']});
  await Promise.allSettled(tabs.filter(tab=>Number.isInteger(tab.id)).map(tab=>chrome.scripting.executeScript({target:{tabId:tab.id},files:['problem.js','samples.js','statement.js','open-settings.js','dashboard.js','shortcut.js']})));
}
function start(){poll();connectWakeup();restoreShortcuts().catch(()=>{});}
async function recoverAfterUpdate(details){
  const parts=details?.previousVersion?.split('.').map(Number);
  const legacy=parts&&parts[0]===1&&(parts[1]<5||(parts[1]===5&&parts[2]===0));
  if(details?.reason!=='update'||!legacy||!chrome.scripting?.executeScript||!chrome.tabs?.reload)return;
  const tabs=await chrome.tabs.query({url:['https://codeforces.com/*','https://www.codeforces.com/*']});
  await Promise.allSettled(tabs.filter(tab=>Number.isInteger(tab.id)).map(async tab=>{
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
      if(!/^\/(?:problemset\/problem\/[1-9]\d*\/[a-z]\d*|(?:contest|gym)\/[1-9]\d*\/problem\/[a-z]\d*)\/?$/i.test(location.pathname))return false;
      const edited=[...document.querySelectorAll('input,textarea')].some(field=>field.type==='file'?field.files?.length:!['hidden','checkbox','radio','submit','button'].includes(field.type)&&field.value!==field.defaultValue);
      const editor=document.querySelector('[contenteditable="true"],.monaco-editor,.CodeMirror,.ace_editor');
      if(edited||editor){
        const notice=document.createElement('div');notice.textContent='扩展已更新：请保存页面输入并刷新此题目页一次，以恢复 Shift+N。';notice.style='position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff3cd;color:#111;padding:14px';document.documentElement.append(notice);return false;
      }
      return true;
    }});
    if(results[0]?.result===true)await chrome.tabs.reload(tab.id);
  }));
}
chrome.runtime.onStartup.addListener(start);
chrome.runtime.onInstalled.addListener(details=>{start();recoverAfterUpdate(details).catch(()=>{});});start();
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if(m.action==='cfhelper-add-dashboard'){
    (async()=>{
      const source=s.tab||((s.url===chrome.runtime.getURL('popup.html')&&Number.isInteger(m.tabId))?await chrome.tabs.get(m.tabId):null);
      if(!source)throw Error('批量操作来源无效。');
      const url=s.tab?s.url:source.url;
      return createDashboardFiles(source.id,url,m.problems);
    })().then(reply).catch(e=>reply({error:e.message}));return true;
  }
  if(m.action==='cfhelper-add-problem'){
    let url;try{url=new URL(s.url);}catch{return;}
    if(!s.tab||(url.protocol!=='https:'||!['codeforces.com','www.codeforces.com'].includes(url.hostname)||url.port)||!/^\/(?:problemset\/problem\/[1-9]\d*\/[a-z]\d*|(?:contest|gym)\/[1-9]\d*\/problem\/[a-z]\d*)\/?$/i.test(url.pathname))return;
    (async()=>{
      const {bridgeSecret,directory,initialContent,openAfterAdd}=await chrome.storage.local.get(['bridgeSecret','directory','initialContent','openAfterAdd']);
      if(!directory?.trim())throw Error('尚未设置保存目录，请打开扩展设置填写。');
      if(!bridgeSecret)throw Error('尚未配对，请在扩展设置中完成配对。');
      let data;try{data=await chrome.runtime.sendNativeMessage('com.codeforces_helper.local',{action:'create',secret:bridgeSecret,url:url.href,directory,initialContent,samples:m.samples,statement:m.statement,openAfterAdd:openAfterAdd||{}});}
      catch{throw Error('尚未连接本机助手，请运行一次 submit --install-native '+chrome.runtime.id);}
      return data;
    })().then(reply).catch(e=>reply({error:e.message}));return true;
  }
  if(m.poll&&s.url===chrome.runtime.getURL('options.html')){poll();connectWakeup();reply({});return;}
  if(!s.url?.startsWith('https://codeforces.com/')||!/^27121:[a-f0-9]{48}$/.test(m.key))return;
  (async()=>{
    if(m.attention&&s.tab){await chrome.tabs.update(s.tab.id,{active:true});await chrome.windows.update(s.tab.windowId,{focused:true});}
    const [port,token]=m.key.split(':');
    const r=await fetch(`http://127.0.0.1:${port}/${m.result?'result':'job'}?token=${token}`,m.result?{method:'POST',body:JSON.stringify(m.result)}:{});
    if(!r.ok)throw Error('本机任务不存在或已领取');const data=await r.json();
    if(m.result?.final&&m.result?.ok&&s.tab)setTimeout(()=>chrome.tabs.remove(s.tab.id).catch(()=>{}),500);
    return {data};
  })().then(reply).catch(e=>reply({error:e.message}));return true;
});
