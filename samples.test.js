const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {readSamples}=require('./extension/samples');const {appendSamples}=require('./samples');const {createProblemFile}=require('./files-server');
const t=value=>({nodeType:3,nodeValue:value});const e=(name,...children)=>({nodeType:1,nodeName:name,childNodes:children});
function page(inputs,outputs){return {querySelector:()=>null,querySelectorAll:selector=>selector.includes('.input')?inputs:outputs};}
test('读取全部样例，兼容 br、逐行 div 和文本换行，保留空行',()=>{
 const root=page([e('PRE',t('2'),e('BR'),t('1 2'),e('BR'),e('BR'),t('3 4')),e('PRE',e('DIV',t('5')),e('DIV',t('6 7')))],[e('PRE',t('3\n\n7\n')),e('PRE',e('DIV',t('11')))]);
 assert.deepEqual(readSamples(root),[{input:'2\n1 2\n\n3 4',output:'3\n\n7'},{input:'5\n6 7',output:'11'}]);
});
test('样例缺失或输入输出不配对时报告错误，不悄悄遗漏',()=>{
 assert.throws(()=>readSamples(page([],[])),/完整样例/);assert.throws(()=>readSamples(page([e('PRE',t('1'))],[])),/完整样例/);
});
test('末尾注释包含每组输入输出，并防止样例中的结束标记破坏代码',()=>{
 const result=appendSamples('int main(){}',[{input:'1\n2',output:'3'},{input:'*/',output:'ok'}]);
 assert.ok(result.startsWith('int main(){}\n\n/*\n'));assert.ok(result.endsWith('\n*/\n'));assert.match(result,/样例 1\n输入：\n1\n2\n输出：\n3/);assert.match(result,/样例 2\n输入：\n\* \/\n输出：\nok/);assert.throws(()=>appendSamples('code',[{input:123,output:'1'}]),/格式错误/);
});
test('覆盖文件时模板加全部样例只写一次，错误数据不覆盖源码',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-samples-')),state=path.join(dir,'prefs.json'),url='https://codeforces.com/contest/2278/problem/D';
 try{
  const samples=[{input:'1\n2',output:'3'},{input:'4',output:'5'}];const template='// template\n';
  const first=await createProblemFile(dir,url,state,template,samples);assert.equal(first.sampleCount,2);assert.equal(await fs.readFile(first.path,'utf8'),appendSamples(template,samples));
  await createProblemFile(dir,url,state,template,samples);const code=await fs.readFile(first.path,'utf8');assert.equal((code.match(/样例 1/g)||[]).length,1);
  await assert.rejects(createProblemFile(dir,url,state,template,[{input:'missing output'}]),/格式错误/);assert.equal(await fs.readFile(first.path,'utf8'),code);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
