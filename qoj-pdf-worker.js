'use strict';
const path=require('node:path'),{workerData,parentPort}=require('node:worker_threads');
function pageText(items){
 const escape=text=>text.replace(/([\\`*_\[\]<>])/g,'\\$1');
 const lines=[];let line=null;
 for(const item of items){
  if(typeof item.str!=='string')continue;
  const x=item.transform[4],y=item.transform[5],height=Math.abs(item.height)||Math.hypot(item.transform[2],item.transform[3])||10;
  const delta=line?y-line.y:0,script=line&&height<line.height*0.85&&Math.abs(delta)>1&&Math.abs(delta)<line.height*0.8&&x>=line.end-line.height&&x-line.end<line.height*1.5;
  if(!line||!script&&Math.abs(delta)>Math.max(2,Math.min(height,line.height)*0.45)){
   line={text:'',y,height,end:x};lines.push(line);
  }
  const gap=x-line.end,space=line.text&&!/\s$/.test(line.text)&&!/^\s/.test(item.str)&&gap>Math.max(1,height*0.12)?' ':'';
  const text=escape(item.str);line.text+=space+(script?(delta>0?'<sup>':'<sub>')+text+(delta>0?'</sup>':'</sub>'):text);line.end=x+item.width;line.height=Math.max(line.height,height);
  if(item.hasEOL)line=null;
 }
 const heights=lines.filter(line=>line.text.trim()).map(line=>line.height).sort((a,b)=>a-b),body=heights[Math.floor(heights.length/2)]||10;
 return lines.map(line=>{
  const text=line.text.trim().replace(/\u0000/g,'');if(!text)return '';
  const heading=/^【[^】]{1,30}】$/.test(text)||/^(?:Input|Output|Constraints|Scoring|Notes?|Examples?|Sample (?:Input|Output)(?:\s*\d+)?|输入(?:格式|说明)?|输出(?:格式|说明)?|题目描述|数据范围|限制|样例(?:输入|输出|说明)?(?:\s*\d+)?)\s*[:：]?$/i.test(text);
  if(heading||line.height>body*1.3&&text.length<100)return '\n#### '+text+'\n';
  return text.replace(/^([#>+-])(?=\s)/,'\\$1')+'  ';
 }).join('\n').trim();
}
async function convert(){
 let canvas;
 try{canvas=require('@napi-rs/canvas');require.resolve('pdfjs-dist/legacy/build/pdf.mjs');}
 catch{throw Error('PDF 转换依赖未安装，请在 oj-helper 项目目录运行 npm ci 后重试。');}
 for(const name of ['DOMMatrix','ImageData','Path2D'])globalThis[name]??=canvas[name];
 const {pathToFileURL}=require('node:url');
 const pdfPath=require.resolve('pdfjs-dist/legacy/build/pdf.mjs'),{getDocument}=await import(pathToFileURL(pdfPath).href);
 class CanvasFactory{
  create(width,height){const target=canvas.createCanvas(Math.ceil(width),Math.ceil(height));return {canvas:target,context:target.getContext('2d')};}
  reset(target,width,height){target.canvas.width=Math.ceil(width);target.canvas.height=Math.ceil(height);}
  destroy(target){target.canvas.width=target.canvas.height=1;target.canvas=target.context=null;}
 }
 const base=path.resolve(path.dirname(pdfPath),'../..')+path.sep;
 const loading=getDocument({data:workerData.bytes,CanvasFactory,verbosity:0,isEvalSupported:false,useSystemFonts:true,enableXfa:false,cMapUrl:base+'cmaps'+path.sep,cMapPacked:true,standardFontDataUrl:base+'standard_fonts'+path.sep});
 try{
  const document=await loading.promise;if(document.numPages>80)throw Error('QOJ PDF 超过 80 页，未覆盖文件。');
  const pages=[];let total=0;
  for(let number=1;number<=document.numPages;number++){
   const page=await document.getPage(number),text=pageText((await page.getTextContent()).items),original=page.getViewport({scale:1});
   const scale=Math.min(1.6,Math.sqrt(4000000/(original.width*original.height))),viewport=page.getViewport({scale});
   const factory=new CanvasFactory(),target=factory.create(viewport.width,viewport.height);
   await page.render({canvasContext:target.context,viewport,canvasFactory:factory}).promise;
   const png=target.canvas.toBuffer('image/png');total+=png.length;
   if(total>64*1024*1024)throw Error('QOJ PDF 页面图像超过 64 MiB，未覆盖文件。');
   pages.push({text,png:new Uint8Array(png)});factory.destroy(target);page.cleanup();
  }
  return {pages};
 }finally{await loading.destroy();}
}
if(parentPort)convert().then(result=>parentPort.postMessage(result,result.pages.map(page=>page.png.buffer))).catch(error=>parentPort.postMessage({error:'QOJ PDF 全文转换失败：'+error.message}));
