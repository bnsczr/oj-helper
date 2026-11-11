// Self-contained so it can also run through chrome.scripting.executeScript.
function readStatement(root=document,source=location.href){
 const statement=root.querySelector('.problem-statement')||root;
 const titleNode=statement.querySelector('.header .title, .title');
 const title=titleNode?.textContent.trim();
 if(!title)throw Error('未读取到完整题面，请等待题目加载完成后重试。');
 function children(node){return Array.from(node.childNodes||[]).map(render).join('');}
 function absolute(value){try{return new URL(value,source).href;}catch{return value||'';}}
 function fence(value){const runs=value.match(/`+/g)||[];return '`'.repeat(Math.max(3,...runs.map(run=>run.length+1)));}
 function plain(node){
  if(node.nodeType===3)return node.nodeValue||'';
  if(node.nodeName==='BR')return '\n';
  const text=Array.from(node.childNodes||[]).map(plain).join('');
  return /^(DIV|P|LI)$/.test(node.nodeName)&&!text.endsWith('\n')?text+'\n':text;
 }
 function render(node){
  if(node.nodeType===3)return (node.nodeValue||'').replace(/\u00a0/g,' ');
  const tag=node.nodeName,classes=node.classList;
  if(node===titleNode||classes?.contains('MathJax_Preview')||classes?.contains('MathJax')||classes?.contains('MathJax_Display')||classes?.contains('input-output-copier')||['STYLE','BUTTON','NOSCRIPT'].includes(tag))return '';
  if(tag==='SCRIPT')return /^math\/tex/.test(node.getAttribute('type')||'')?' $'+(node.textContent||'').trim()+'$ ':'';
  if(tag==='BR')return '\n';
  if(tag==='IMG')return '!['+(node.getAttribute('alt')||'图片')+']('+absolute(node.getAttribute('src'))+')';
  if(tag==='PRE'){
   const value=plain(node).replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/\n$/,'');
   const mark=fence(value);return '\n\n'+mark+'text\n'+value+'\n'+mark+'\n\n';
  }
  const text=children(node);
  if(tag==='A')return '['+text.trim()+']('+absolute(node.getAttribute('href'))+')';
  if(tag==='B'||tag==='STRONG')return '**'+text+'**';
  if(tag==='I'||tag==='EM')return '*'+text+'*';
  if(tag==='SUP')return '<sup>'+text+'</sup>';
  if(tag==='SUB')return '<sub>'+text+'</sub>';
  if(tag==='LI')return '\n- '+text.trim()+'\n';
  if(classes?.contains('section-title'))return '\n\n## '+text.trim()+'\n\n';
  if(tag==='TD'||tag==='TH')return text.trim()+' | ';
  if(tag==='TR')return '\n| '+text+'\n';
  if(/^(DIV|P|UL|OL|TABLE|H[1-6])$/.test(tag))return '\n\n'+text.trim()+'\n\n';
  return text;
 }
 const body=children(statement).trim();
 return '# '+title+'\n\n[题目链接]('+source+')\n\n'+body+'\n';
}
if(typeof module!=='undefined')module.exports={readStatement};
