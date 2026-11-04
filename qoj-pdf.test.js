const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pdfToMarkdown}=require('./qoj-pdf'),{pdfDocument}=require('./test-support/qoj-fixtures');
const {createQojFiles}=require('./qoj-files'),{main:open}=require('./open');
const {readPreferences}=require('./preferences');
const pdfResource=(bytes,id)=>({url:'https://qoj.ac/download.php?type=statement&id='+id,base64:bytes.toString('base64')});
async function fixture(run){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'qoj-pdf-'));try{await run(directory,path.join(directory,'state.json'));}finally{await fs.rm(directory,{recursive:true,force:true});}}

test('PDF 转换读取所有页的正文和输入输出，页面图像保留图表',async()=>{
 const result=await pdfToMarkdown(pdfDocument([['Complete description on first page','Input','An integer n','Output','The minimum cost'],['Second page constraints and explanation']]));
 assert.equal(result.pages.length,2);assert.match(result.pages[0].text,/Complete description[\s\S]*Input[\s\S]*An integer n[\s\S]*Output[\s\S]*minimum cost/);assert.match(result.pages[1].text,/Second page constraints/);
 for(const page of result.pages)assert.deepEqual(Buffer.from(page.png).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
});

test('Dashboard 保存每题完整 PDF 正文、全部页图像和样例，HTML 题面仍保留',async()=>fixture(async(directory,stateFile)=>{
 await createQojFiles({action:'qoj-create-dashboard',directory,url:'https://qoj.ac/contest/42',initialContent:'// template',problems:[
  {index:'A',url:'https://qoj.ac/contest/42/problem/123',statement:'# A',samples:[{input:'1',output:'2'}],pdf:pdfResource(pdfDocument([['Unique problem A description','Input','Output'],['Unique problem A second page']]),'123')},
  {index:'B',url:'https://qoj.ac/contest/42/problem/124',statement:'# B\n\nHTML full description and constraints',samples:[{input:'3',output:'4'}]}
 ]},stateFile);
 const state=readPreferences(stateFile),statement=state.qoj.lastAddition.statement;assert.equal(state.qoj.lastAddition.statementVersion,2);
 assert.match(statement,/Unique problem A description[\s\S]*Input[\s\S]*Output[\s\S]*Unique problem A second page/);assert.match(statement,/HTML full description/);assert.match(statement,/### 样例 1/);
 for(const page of [1,2]){const name='QOJ-123-page-'+page+'.png';assert.ok(statement.includes('statements/'+name));assert.ok((await fs.stat(path.join(directory,'statements',name))).size>100);}
 assert.equal((await fs.readFile(path.join(directory,'A.cpp'),'utf8')).includes('Unique problem A'),false);
}));

test('open s 从旧 PDF 原件补全题面并持久化，不覆盖源码，之后离线复用',async()=>fixture(async(directory,stateFile)=>{
 await fs.mkdir(path.join(directory,'statements'));await fs.writeFile(path.join(directory,'statements','QOJ-123.pdf'),pdfDocument([['Recovered entire statement','Input','Output']]));await fs.writeFile(path.join(directory,'A.cpp'),'// keep my solution');
 const added={oj:'qoj',kind:'problem',problem:'123',contest:'42',directory,statement:'# Old title\n\n[PDF 题面原件](statements/QOJ-123.pdf)\n\n## 导入样例\n\n1 -> 2'};
 await fs.writeFile(stateFile,JSON.stringify({activeOj:'qoj',defaultProblem:'1A',qoj:{lastAddition:added}}));const opened=[];
 await open(['s'],{stateFile,log:()=>{},openEditor:async target=>opened.push(target)});
 assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),/Recovered entire statement[\s\S]*Input[\s\S]*Output[\s\S]*导入样例/);
 assert.equal(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),'// keep my solution');assert.equal(readPreferences(stateFile).defaultProblem,'1A');assert.equal(readPreferences(stateFile).qoj.lastAddition.statementVersion,2);assert.deepEqual(opened,[path.join(directory,'statement.md')]);
 await fs.unlink(path.join(directory,'statements','QOJ-123.pdf'));await open(['s'],{stateFile,log:()=>{},openEditor:async()=>{}});assert.match(await fs.readFile(path.join(directory,'statement.md'),'utf8'),/Recovered entire statement/);
}));

test('PDF 损坏时整场导入明确失败，不先覆盖其他源码或记录',async()=>fixture(async(directory,stateFile)=>{
 await fs.writeFile(path.join(directory,'A.cpp'),'keep A');await fs.writeFile(path.join(directory,'B.cpp'),'keep B');await fs.writeFile(stateFile,'{}');
 await assert.rejects(createQojFiles({action:'qoj-create-dashboard',directory,url:'https://qoj.ac/contest/42',problems:[
  {index:'A',url:'https://qoj.ac/contest/42/problem/123',statement:'# A full HTML statement',samples:[]},
  {index:'B',url:'https://qoj.ac/contest/42/problem/124',statement:'# B',samples:[],pdf:pdfResource(Buffer.from('%PDF-1.4\ninvalid'),'124')}
 ]},stateFile),/PDF 全文转换失败/);
 assert.equal(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),'keep A');assert.equal(await fs.readFile(path.join(directory,'B.cpp'),'utf8'),'keep B');assert.equal(await fs.readFile(stateFile,'utf8'),'{}');
}));

test('没有文字层的 PDF 仍完整嵌入页面，提示文字无法提取',async()=>fixture(async(directory,stateFile)=>{
 const result=await createQojFiles({action:'qoj-create',directory,problem:{url:'https://qoj.ac/problem/123',statement:'# Scanned problem',samples:[{input:'1',output:'2'}],pdf:pdfResource(pdfDocument([['']]),'123')}},stateFile);
 assert.ok(result.warnings.some(text=>text.includes('没有可提取文字')));assert.match(readPreferences(stateFile).qoj.lastAddition.statement,/!\[题面第 1 页\]\(statements\/QOJ-123-page-1.png\)/);
}));
