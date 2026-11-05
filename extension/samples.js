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
 const inputs=Array.from(statement.querySelectorAll('.sample-test .input pre'));
 const outputs=Array.from(statement.querySelectorAll('.sample-test .output pre'));
 if(!inputs.length||inputs.length!==outputs.length){if(allowMissing)return null;throw Error('未读取到完整样例，请等待题目加载完成后重试。');}
 const normalize=node=>text(node).replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/^\n|\n$/g,'');
 return inputs.map((input,index)=>({input:normalize(input),output:normalize(outputs[index])}));
}
if(typeof module!=='undefined')module.exports={readSamples};
