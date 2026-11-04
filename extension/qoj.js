// Shared URL contracts. Browser readers are kept separate from CF adapters.
function qojTarget(value){
 const text=String(value).trim();let problem,contest=null;
 if(/^[1-9]\d*$/.test(text))problem=text;
 else{
  let url;try{url=new URL(text);}catch{throw Error('请输入 QOJ 数字题号或题目网址，例如 123 或 https://qoj.ac/problem/123。');}
  if(url.protocol!=='https:'||url.hostname!=='qoj.ac'||url.port||url.username||url.password)throw Error('题目网址必须来自 https://qoj.ac。');
  const match=/^\/(?:contest\/([1-9]\d*)\/)?problem\/([1-9]\d*)(?:\/statement\/[a-z0-9_-]+)?\/?$/i.exec(url.pathname);
  if(!match)throw Error('当前页面不是 QOJ 题目页。');contest=match[1]||null;problem=match[2];
 }
 return {oj:'qoj',problem,contest,section:'contest',url:'https://qoj.ac/'+(contest?'contest/'+contest+'/':'')+'problem/'+problem};
}
function qojDashboard(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='qoj.ac'||url.port||url.username||url.password)return null;const match=/^\/contest\/([1-9]\d*)\/?$/.exec(url.pathname);return match?{oj:'qoj',contest:match[1],section:'contest',url:url.origin+'/contest/'+match[1]}:null;}catch{return null;}
}
function inspectQojPage(){
 if(location.origin!=='https://qoj.ac')return null;
 const copy=document.documentElement.cloneNode(true);
 copy.querySelectorAll('script,style,textarea,.CodeMirror,.ace_editor,.monaco-editor').forEach(node=>node.remove());
 copy.querySelectorAll('input').forEach(node=>node.setAttribute('value',''));
 if(/^\/submission\//.test(location.pathname))copy.querySelectorAll('pre,code').forEach(node=>{node.textContent='[诊断已移除代码及预览内容]';});
 copy.querySelectorAll('*').forEach(node=>Array.from(node.attributes||[]).forEach(attribute=>{if(/^on|nonce|token|csrf/i.test(attribute.name))node.removeAttribute(attribute.name);}));
 const html=copy.outerHTML;
 return {url:location.href,title:document.title,html:html.slice(0,300000),truncated:html.length>300000};
}
if(typeof module!=='undefined')module.exports={qojTarget,qojDashboard};
