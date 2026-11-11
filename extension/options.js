var ojBrowser=globalThis.browser??globalThis.chrome;
document.querySelector('#save').onclick=async()=>{const secret=document.querySelector('#secret').value.trim();if(!/^[a-f0-9]{64}$/.test(secret)){document.querySelector('#status').textContent='配对码应为 64 位字符';return;}await ojBrowser.storage.local.set({bridgeSecret:secret});document.querySelector('#secret').value='';document.querySelector('#status').textContent='已保存，可以回到 VS Code 提交。';ojBrowser.runtime.sendMessage({poll:true});};
ojBrowser.storage.local.get('directory').then(({directory})=>{document.querySelector('#directory').value=directory||'';});
document.querySelector('#saveDirectory').onclick=async()=>{const directory=document.querySelector('#directory').value.trim();const status=document.querySelector('#directoryStatus');if(directory&&!/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/i.test(directory)){status.textContent='请填写绝对路径，例如 E:\\code\\CF。';return;}await ojBrowser.storage.local.set({directory});status.textContent=directory?'保存目录已更新。':'已清除保存目录；新建时将提示设置。';};

document.querySelector('#nativeInstall').textContent='submit --install-native '+ojBrowser.runtime.id;

ojBrowser.storage.local.get('initialContent').then(({initialContent})=>{document.querySelector('#initialContent').value=typeof initialContent==='string'?initialContent:DEFAULT_INITIAL_CONTENT;});
document.querySelector('#saveInitialContent').onclick=async()=>{
 try{await ojBrowser.storage.local.set({initialContent:document.querySelector('#initialContent').value});document.querySelector('#initialContentStatus').textContent='初始内容已保存，下次添加题目时生效。';}
 catch(e){document.querySelector('#initialContentStatus').textContent='保存失败：'+e.message;}
};
document.querySelector('#resetInitialContent').onclick=async()=>{
 try{await ojBrowser.storage.local.set({initialContent:DEFAULT_INITIAL_CONTENT});document.querySelector('#initialContent').value=DEFAULT_INITIAL_CONTENT;document.querySelector('#initialContentStatus').textContent='已恢复并保存默认内容。';}
 catch(e){document.querySelector('#initialContentStatus').textContent='保存失败：'+e.message;}
};
ojBrowser.storage.local.get('openAfterAdd').then(({openAfterAdd})=>{
 for(const [key,value] of Object.entries(normalizeOpenSettings(openAfterAdd)))document.querySelector('#'+key).checked=value;
});
document.querySelector('#saveOpenAfterAdd').onclick=async()=>{
 try{
  const openAfterAdd=Object.fromEntries(Object.keys(normalizeOpenSettings()).map(key=>[key,document.querySelector('#'+key).checked]));
  await ojBrowser.storage.local.set({openAfterAdd});document.querySelector('#openAfterAddStatus').textContent='自动打开设置已保存，下次添加时生效。';
 }catch(error){document.querySelector('#openAfterAddStatus').textContent='保存失败：'+error.message;}
};
ojBrowser.storage.local.get('standingsShowUnofficial').then(({standingsShowUnofficial})=>{document.querySelector('#standingsShowUnofficial').checked=standingsShowUnofficial!==false;});
document.querySelector('#saveStandings').onclick=async()=>{
 try{await ojBrowser.storage.local.set({standingsShowUnofficial:document.querySelector('#standingsShowUnofficial').checked});document.querySelector('#standingsStatus').textContent='榜单设置已保存，下次运行 open b 时生效。';}
 catch(error){document.querySelector('#standingsStatus').textContent='保存失败：'+error.message;}
};
Promise.resolve(ojBrowser.runtime.sendMessage({poll:true})).catch(()=>{});
if(typeof fetch==='function'&&typeof AbortSignal!=='undefined'){
 (async()=>{
  const status=document.querySelector('#connectionStatus'),{bridgeSecret}=await ojBrowser.storage.local.get('bridgeSecret');if(!bridgeSecret)return;
  try{const response=await fetch('http://127.0.0.1:27121/health',{headers:{Authorization:'Bearer '+bridgeSecret,'X-Oj-Helper-Platforms':'cf,qoj'},signal:AbortSignal.timeout(3000)});if(status)status.textContent=response.ok?'本机连接正常，已通知后台检查任务。':response.status===403?'本机配对不匹配，请重新保存 submit --pair 显示的配对码。':'本机正在处理其他连接。';}
  catch{if(status)status.textContent='本机当前没有等待中的提交或诊断任务。';}
 })();
}
