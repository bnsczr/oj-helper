
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const hostName='com.codeforces_helper.local';
function detectExtensionIds(local=process.env.LOCALAPPDATA){
 const ids=new Set();
 for(const base of ['Google/Chrome/User Data','Microsoft/Edge/User Data']){
  const userData=path.join(local,base);if(!fs.existsSync(userData))continue;
  for(const entry of fs.readdirSync(userData,{withFileTypes:true})){
   if(!entry.isDirectory()||! /^(Default|Profile \d+)$/.test(entry.name))continue;
   for(const name of ['Preferences','Secure Preferences']){
    let prefs;try{prefs=JSON.parse(fs.readFileSync(path.join(userData,entry.name,name),'utf8'));}catch{continue;}
    for(const [id,data] of Object.entries(prefs.extensions?.settings||{})){
     if(!/^[a-p]{32}$/.test(id))continue;
     if(['oj-helper','Codeforces Helper Local'].includes(data.manifest?.name))ids.add(id);
     else if(data.path&&path.resolve(data.path).toLowerCase()===path.join(__dirname,'extension').toLowerCase())ids.add(id);
    }
   }
  }
 }
 return [...ids];
}
function installNative(ids=detectExtensionIds()){
 if(process.platform!=='win32')throw Error('自动安装目前支持 Windows。');
 if(!ids.length)throw Error('没有检测到扩展。请在扩展设置查看连接安装命令，运行 submit --install-native 扩展ID。');
 if(ids.some(id=>!/^[a-p]{32}$/.test(id)))throw Error('扩展 ID 应为 32 位 a-p 字符。');
 const directory=path.join(__dirname,'.native-host');fs.mkdirSync(directory,{recursive:true});
 const executable=path.join(directory,'launcher-v5.exe'),manifestPath=path.join(directory,hostName+'.json');
 if(!fs.existsSync(executable)||fs.statSync(executable).mtimeMs<fs.statSync(path.join(__dirname,'native-launcher.cs')).mtimeMs){
  const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const result=spawnSync(compiler,['/nologo','/target:winexe','/out:'+executable,path.join(__dirname,'native-launcher.cs')],{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw Error('安装启动器失败：'+(result.error?.message||result.stdout||result.stderr));
 }
 fs.writeFileSync(path.join(directory,'node-path.txt'),process.execPath,'utf8');
 let existing=[];try{existing=JSON.parse(fs.readFileSync(manifestPath,'utf8')).allowed_origins||[];}catch{}
 const allowed_origins=[...new Set([...existing,...ids.map(id=>'chrome-extension://'+id+'/')])];
 fs.writeFileSync(manifestPath,JSON.stringify({name:hostName,description:'oj-helper local integration',path:executable,type:'stdio',allowed_origins},null,2));
 for(const browser of ['Google\\Chrome','Microsoft\\Edge']){
  const result=spawnSync('reg.exe',['ADD','HKCU\\Software\\'+browser+'\\NativeMessagingHosts\\'+hostName,'/ve','/t','REG_SZ','/d',manifestPath,'/f'],{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw Error('注册浏览器连接失败：'+(result.error?.message||result.stderr));
 }
 return ids;
}
module.exports={detectExtensionIds,installNative,hostName};
