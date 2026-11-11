function readSamples(root=document,allowMissing=false){
 root??=document;
 // Read text nodes and explicit line breaks, including Codeforces' per-line divs.
 function text(node){
  if(node.nodeType===3)return node.nodeValue||'';
  if(node.nodeName==='BR')return '\n';
  const value=Array.from(node.childNodes||[]).map(text).join('');
  return /^(DIV|P|LI)$/.test(node.nodeName)&&!value.endsWith('\n')?value+'\n':value;
 }
 const statement=root.querySelector('.problem-statement')||root;
 const description=statement.textContent||'';
 const interactive=!!statement.querySelector('.interaction')||/(?:this is an? interactive (?:problem|task)|this problem is interactive|интерактивная задача)(?![\p{L}\p{N}])|这是一道交互题/iu.test(description);
 const special=interactive||/\b(?:communication problem|run[- ]twice)\b|这是一道通信题/i.test(description);
 const normalize=node=>{
  const value=text(node).replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/\n$/,'');
  // A leading blank can indicate that the other side spoke first.
  return interactive?value:value.replace(/^\n/,'');
 };
 const samples=[];
 const incomplete=()=>{if(allowMissing)return null;throw Error('未读取到完整样例，请等待题目加载完成后重试。');};
 for(const group of statement.querySelectorAll('.sample-test')){
  let input;
  for(const pre of group.querySelectorAll('pre')){
   const value=normalize(pre),side=pre.closest('.input, .output');
   if(side?.classList.contains('output')&&input!==undefined){samples.push({input,output:value});input=undefined;continue;}
   if(input!==undefined){if(!special)return incomplete();samples.push({transcript:'输入：\n'+input});input=undefined;}
   if(side?.classList.contains('input'))input=value;
   else if(special)samples.push({transcript:side?'输出：\n'+value:value});
   else return incomplete();
  }
  if(input!==undefined){if(!special)return incomplete();samples.push({transcript:'输入：\n'+input});}
 }
 return samples.length||special&&statement.querySelector('.header .title, .title')?samples:incomplete();
}
if(typeof module!=='undefined')module.exports={readSamples};
