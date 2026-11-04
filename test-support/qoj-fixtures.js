const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {parseHTML}=require('linkedom');
function pdfDocument(pages=['Problem description','Input','Output']){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],kids=[];
 for(const lines of pages){
  const id=objects.length+1,contentId=id+1;kids.push(id+' 0 R');
  const texts=Array.isArray(lines)?lines:[lines];
  const stream='BT /F1 12 Tf 40 740 Td '+texts.map((text,index)=>(index?'0 -24 Td ':'')+'('+text.replace(/([\\()])/g,'\\$1')+') Tj').join('\n')+' ET\n0 0 1 RG 40 100 200 50 re S';
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+contentId+' 0 R >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream');
 }
 objects[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >>';
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((body,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(index+1)+' 0 obj\n'+body+'\nendobj\n';});
 const xref=Buffer.byteLength(pdf);pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(pdf);
}
function page(html,url='https://qoj.ac/problem/123',extra={}){
 const {document,window}=parseHTML('<html><head><title>QOJ</title></head><body>'+html+'</body></html>');
 const context=vm.createContext({document,location:new URL(url),URL,Date,Event:window.Event,...extra});
 for(const file of ['qoj.js','qoj-page.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','extension',file),'utf8'),context);
 return {context,document,run:source=>vm.runInContext(source,context)};
}
const account='<div><ul class="nav nav-pills float-right"><li class="nav-item dropdown"><a class="nav-link dropdown-toggle"><a class="uoj-username" href="//qoj.ac/user/profile/TestUser">TestUser</a></a></li></ul></div>';
const form='<form id="form-answer"><div id="form-group-answer_answer"><select name="answer_answer_language"><option value="C++17">C++ 17</option><option value="C++23" selected>C++ 23</option></select><input type="radio" name="answer_answer_upload_type" value="file"><input type="file" name="answer_answer_file"><textarea name="answer_answer_editor"></textarea></div><button type="submit" id="button-submit-answer">Submit</button></form>';
function submission(id=101,verdict='AC ✓',language='C++23'){
 return '<table><thead><tr>'+['ID','Problem','Submitter','Result','Time','Memory','Language'].map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody><tr><td><a href="/submission/'+id+'">#'+id+'</a></td><td><a href="/contest/42/problem/123">#123. Example</a></td><td><a href="/user/profile/TestUser">TestUser</a></td><td><a class="uoj-score" data-score="100" data-full="100">'+verdict+'</a></td><td>12ms</td><td>4096kb</td><td>'+language+'</td></tr></tbody></table>';
}
function card(number,checker='ok',extra=false){return '<div class="card"><div class="card-header"><h4 class="card-title">'+(extra?'Extra Test':'Test')+' #'+number+': </h4></div><div class="card-collapse collapse"><div class="card-body"><h4>output (stdout):</h4><pre>program output</pre><h4>result:</h4><pre>'+checker+'</pre></div></div></div>';}
function zip(files,{compressed=true}={}){
 const locals=[],central=[];let offset=0;
 const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 for(const [name,text] of Object.entries(files)){
  const nameBytes=Buffer.from(name),data=Buffer.from(text),packed=compressed?zlib.deflateRawSync(data):data;let checksum=0xffffffff;for(const byte of data)checksum=table[(checksum^byte)&255]^(checksum>>>8);checksum=(checksum^0xffffffff)>>>0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(compressed?8:0,8);local.writeUInt32LE(checksum,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);
  const header=Buffer.alloc(46);header.writeUInt32LE(0x02014b50);header.writeUInt16LE(20,6);header.writeUInt16LE(compressed?8:0,10);header.writeUInt32LE(checksum,16);header.writeUInt32LE(packed.length,20);header.writeUInt32LE(data.length,24);header.writeUInt16LE(nameBytes.length,28);header.writeUInt32LE(offset,42);
  locals.push(local,nameBytes,packed);central.push(header,nameBytes);offset+=local.length+nameBytes.length+packed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}
module.exports={page,account,form,submission,card,zip,pdfDocument};
