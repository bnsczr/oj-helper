#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createBridge}=require('./bridge'),{notifyBrowser}=require('./wakeup');
async function main(){
 const secret=fs.readFileSync(path.join(__dirname,'.bridge-secret'),'utf8').trim(),token=crypto.randomBytes(24).toString('hex');
 let timer;
 const audit=process.argv.includes('--audit');
 const server=createBridge({secret,token,job:{oj:'qoj',action:audit?'qoj-audit':'qoj-inspect'},onAnnounce:()=>console.log('浏览器已领取诊断任务。'),onEvent:event=>{
  if(!event.final){console.log(event.message);return;}
  if(event.ok&&Array.isArray(event.pages)){
   const target=path.join(__dirname,audit?'.qoj-inspection-audit.json':'.qoj-inspection.json');fs.writeFileSync(target,JSON.stringify(event.pages,null,2),'utf8');console.log('已保存本机页面核验结果：'+target+'（'+event.pages.length+' 页）');
  }else{console.error(event.message);process.exitCode=1;}
  clearTimeout(timer);server.close();server.closeIdleConnections();
 }});
 server.on('request',req=>{const route=new URL(req.url,'http://127.0.0.1').pathname;if(route==='/pending'||route==='/health')console.log(route+' 请求已到达；认证'+(req.headers.authorization==='Bearer '+secret?'通过':'失败')+'；OJ 能力：'+(req.headers['x-oj-helper-platforms']||'旧版未声明'));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(27121,'127.0.0.1',resolve);});
 console.log('等待扩展读取已打开的 QOJ 页面结构…');
 timer=setTimeout(()=>{console.error('未取得页面结构，请确认扩展已重新加载，且有已打开的 QOJ 页面。');process.exitCode=1;server.close();server.closeAllConnections();},audit?240000:120000);
 console.log(await notifyBrowser(secret)?'本机即时通知已送达。':'即时通知未连接，等待浏览器定时领取。');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
