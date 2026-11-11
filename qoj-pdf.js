'use strict';
const path=require('node:path');
const {Worker}=require('node:worker_threads');
function pdfToMarkdown(bytes,{timeout=60000,renderImages=true}={}){
 return new Promise((resolve,reject)=>{
  // PDF.js diagnostics must never reach the native messaging stdout stream.
  const worker=new Worker(path.join(__dirname,'qoj-pdf-worker.js'),{workerData:{bytes:new Uint8Array(bytes),renderImages},stdout:true,stderr:true});
  worker.stdout.resume();worker.stderr.resume();let finished=false;
  const end=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>end(Error('PDF 转换超时。')),timeout);
  worker.once('error',error=>end(error));
  worker.once('exit',code=>{if(!finished)end(Error('QOJ PDF 转换进程提前结束（'+code+'）。'));});
  worker.once('message',message=>message.error?end(Error(message.error)):end(null,message));
 });
}
function pdfMarkdown(converted,problem){
 return '\n\n## 题面正文\n\n'+converted.pages.map((page,index)=>{
  const image='![题面第 '+(index+1)+' 页](statements/QOJ-'+problem+'-page-'+(index+1)+'.png)';
  return '### 第 '+(index+1)+' 页\n\n'+(page.text?page.text+'\n\n<details>\n<summary>原始页面（核对公式和图表）</summary>\n\n'+image+'\n\n</details>':image);
 }).join('\n\n')+'\n';
}
function pdfAssets(converted,problem){return converted.pages.map((page,index)=>({name:'QOJ-'+problem+'-page-'+(index+1)+'.png',bytes:Buffer.from(page.png)}));}
module.exports={pdfToMarkdown,pdfMarkdown,pdfAssets};
