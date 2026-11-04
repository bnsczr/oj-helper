'use strict';
const {spawn}=require('node:child_process');
function browserCommand(url,browser='default',platform=process.platform){
  if(!['default','chrome','edge'].includes(browser))throw Error('--browser 仅支持 default、chrome、edge');
  if(platform==='win32'){
    const encodedUrl=Buffer.from(url,'utf8').toString('base64');
    const target=`$target=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedUrl}')); $ErrorActionPreference='Stop'; `;
    const action=browser==='default'?'Start-Process -FilePath $target':`Start-Process -FilePath '${browser==='edge'?'msedge.exe':'chrome.exe'}' -ArgumentList $target`;
    return ['powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(target+action,'utf16le').toString('base64')]];
  }
  if(platform==='darwin')return ['open',browser==='default'?[url]:['-a',browser==='edge'?'Microsoft Edge':'Google Chrome',url]];
  return [browser==='default'?'xdg-open':browser==='edge'?'microsoft-edge':'google-chrome',[url]];
}
function openBrowser(url,browser){const [command,args]=browserCommand(url,browser);return new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('浏览器启动失败')));});}
module.exports={browserCommand,openBrowser};
