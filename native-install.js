
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const hostName='com.codeforces_helper.local';
const firefoxId='oj-helper@bnsczr.github.io';
function linuxBrowserDirectories({env=process.env,home=os.homedir()}={}){
 const config=path.isAbsolute(env.XDG_CONFIG_HOME||'')?env.XDG_CONFIG_HOME:path.join(home,'.config');
 const chromeConfig=path.isAbsolute(env.CHROME_CONFIG_HOME||'')?env.CHROME_CONFIG_HOME:config;
 const chrome=['google-chrome','google-chrome-beta','google-chrome-unstable','google-chrome-canary','google-chrome-for-testing','chromium'].map(name=>path.join(chromeConfig,name));
 const edge=['microsoft-edge','microsoft-edge-beta','microsoft-edge-dev'].map(name=>path.join(config,name));
 return [...new Set([...(path.isAbsolute(env.CHROME_USER_DATA_DIR||'')?[env.CHROME_USER_DATA_DIR]:[]),...chrome,...edge])];
}
function detectExtensionIds(local=process.env.LOCALAPPDATA,{platform=process.platform,env,home}={}){
 const directories=platform==='linux'?linuxBrowserDirectories({env,home}):local?['Google/Chrome/User Data','Microsoft/Edge/User Data'].map(base=>path.join(local,base)):[];
 const comparable=value=>platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
 const extensionDir=comparable(path.join(__dirname,'extension'));
 const ids=new Set();
 for(const userData of directories){
  if(!fs.statSync(userData,{throwIfNoEntry:false})?.isDirectory())continue;
  for(const entry of fs.readdirSync(userData,{withFileTypes:true})){
   if(!entry.isDirectory()||! /^(Default|Profile \d+)$/.test(entry.name))continue;
   for(const name of ['Preferences','Secure Preferences']){
    let prefs;try{prefs=JSON.parse(fs.readFileSync(path.join(userData,entry.name,name),'utf8'));}catch{continue;}
    for(const [id,data] of Object.entries(prefs.extensions?.settings||{})){
     if(!/^[a-p]{32}$/.test(id))continue;
     if(['oj-helper','Codeforces Helper Local'].includes(data.manifest?.name))ids.add(id);
     else if(typeof data.path==='string'&&comparable(data.path)===extensionDir)ids.add(id);
    }
   }
  }
 }
 return [...ids];
}
function verifyIds(ids){
 if(!ids.length)throw Error('没有检测到扩展。请在扩展设置查看连接安装命令，运行 submit --install-native 扩展ID。');
 if(ids.some(id=>!/^[a-p]{32}$/.test(id)))throw Error('扩展 ID 应为 32 位 a-p 字符。');
}
function writeManifest(manifestPath,executable,ids){
 let existing;try{existing=JSON.parse(fs.readFileSync(manifestPath,'utf8')).allowed_origins;}catch{}
 const preserved=Array.isArray(existing)?existing.filter(origin=>/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin)):[];
 const allowed_origins=[...new Set([...preserved,...ids.map(id=>'chrome-extension://'+id+'/')])];
 fs.writeFileSync(manifestPath,JSON.stringify({name:hostName,description:'oj-helper local integration',path:executable,type:'stdio',allowed_origins},null,2),{mode:0o600});
}
function writeLinuxLauncher(projectDir,nodePath){
 const quote=value=>"'"+value.replace(/'/g,"'\"'\"'")+"'";
 const directory=path.resolve(projectDir,'.native-host'),launcher=path.join(directory,'launcher.sh');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 fs.writeFileSync(launcher,'#!/bin/sh\nexec '+quote(nodePath)+' '+quote(path.resolve(projectDir,'native-host.js'))+' "$@"\n',{mode:0o700});
 fs.chmodSync(launcher,0o700);
 return launcher;
}
function installLinuxNative(ids,{projectDir=__dirname,nodePath=process.execPath,directories=linuxBrowserDirectories()}={}){
 verifyIds(ids);
 const launcher=writeLinuxLauncher(projectDir,nodePath);
 const existing=directories.filter(dir=>fs.statSync(dir,{throwIfNoEntry:false})?.isDirectory());
 for(const dir of existing.length?existing:directories){
  const hosts=path.join(dir,'NativeMessagingHosts');fs.mkdirSync(hosts,{recursive:true});
  writeManifest(path.join(hosts,hostName+'.json'),launcher,ids);
 }
 return ids;
}
function installFirefoxNative({projectDir=__dirname,nodePath=process.execPath,home=os.homedir()}={}){
 const executable=writeLinuxLauncher(projectDir,nodePath);
 const hosts=path.join(home,'.mozilla','native-messaging-hosts');
 fs.mkdirSync(hosts,{recursive:true});
 const manifest={name:hostName,description:'oj-helper local integration',path:executable,type:'stdio',allowed_extensions:[firefoxId]};
 fs.writeFileSync(path.join(hosts,hostName+'.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 return [firefoxId];
}
function installNative(ids){
 if(!['win32','linux'].includes(process.platform))throw Error('自动安装目前支持 Windows 和 Linux。');
 if(ids?.length===1&&['firefox',firefoxId].includes(ids[0])){
  if(process.platform!=='linux')throw Error('Firefox 本机助手目前支持 Linux。');
  return installFirefoxNative();
 }
 ids??=detectExtensionIds();
 if(process.platform==='linux')return installLinuxNative(ids);
 verifyIds(ids);
 const directory=path.join(__dirname,'.native-host');fs.mkdirSync(directory,{recursive:true});
 const executable=path.join(directory,'launcher-v5.exe'),manifestPath=path.join(directory,hostName+'.json');
 if(!fs.existsSync(executable)||fs.statSync(executable).mtimeMs<fs.statSync(path.join(__dirname,'native-launcher.cs')).mtimeMs){
  const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const result=spawnSync(compiler,['/nologo','/target:winexe','/out:'+executable,path.join(__dirname,'native-launcher.cs')],{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw Error('安装启动器失败：'+(result.error?.message||result.stdout||result.stderr));
 }
 fs.writeFileSync(path.join(directory,'node-path.txt'),process.execPath,'utf8');
 writeManifest(manifestPath,executable,ids);
 for(const browser of ['Google\\Chrome','Microsoft\\Edge']){
  const result=spawnSync('reg.exe',['ADD','HKCU\\Software\\'+browser+'\\NativeMessagingHosts\\'+hostName,'/ve','/t','REG_SZ','/d',manifestPath,'/f'],{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw Error('注册浏览器连接失败：'+(result.error?.message||result.stderr));
 }
 return ids;
}
module.exports={detectExtensionIds,installNative,installLinuxNative,linuxBrowserDirectories,installFirefoxNative,firefoxId,hostName};
