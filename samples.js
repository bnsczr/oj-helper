function appendSamples(content,samples=[]){
 if(!Array.isArray(samples)||samples.some(sample=>!sample||(sample.transcript!==undefined?typeof sample.transcript!=='string':typeof sample.input!=='string'||typeof sample.output!=='string')))throw Error('样例格式错误，未写入文件。');
 if(!samples.length)return content;
 const safe=text=>text.replace(/\*\//g,'* /');
 const body=samples.map((sample,index)=>'样例 '+(index+1)+'\n'+(sample.transcript!==undefined?safe(sample.transcript):'输入：\n'+safe(sample.input)+'\n输出：\n'+safe(sample.output))).join('\n\n');
 return content+(content.endsWith('\n')?'':'\n')+'\n/*\n'+body+'\n*/\n';
}
module.exports={appendSamples};
