const {DEFAULT_INITIAL_CONTENT}=require('./extension/template');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseProblem,readPreferences,updatePreferences,languageFor}=require('./preferences');
const {confirmSubmission}=require('./cli');
test('默认题号及按语言类型的偏好跨调用保存，互不覆盖',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cf-prefs-')),file=path.join(dir,'prefs.json');
 try{
  assert.deepEqual(readPreferences(file),{});assert.equal(languageFor('A.cpp',{}),'GNU G++23');
  updatePreferences({defaultProblem:'2278F'},file);
  updatePreferences({languages:{cpp:'GNU G++20',python:'PyPy 3'}},file);
  updatePreferences({defaultProblem:'1A'},file);
  const state=readPreferences(file);assert.equal(state.defaultProblem,'1A');assert.equal(languageFor('A.cc',state),'GNU G++20');assert.equal(languageFor('A.py',state),'PyPy 3');
  assert.deepEqual(parseProblem(' 123b1 '),{contest:'123',problem:'B1'});
  for(const value of ['','A','0A','1A.cpp','1A/2'])assert.throws(()=>parseProblem(value));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function input(answers){return {question:async prompt=>{assert.ok(answers.length,'不应重复询问');return answers.shift();}};}
test('无默认题号不能 y 提交，c 保存后必须再次确认',async()=>{
 const spec={language:'GNU G++23'},saved=[],messages=[];
 assert.equal(await confirmSubmission(input(['y','c','wrong','c','2278f','y']),spec,{saveProblem:x=>saved.push(x),log:x=>messages.push(x)}),true);
 assert.deepEqual(saved,['2278F']);assert.equal(spec.contest,'2278');assert.equal(spec.problem,'F');assert.ok(messages.includes('没有默认题号，请点击 c 修改默认题号'));
});
test('c 永久修改即使稍后 n 取消；默认题号 y 直接使用',async()=>{
 const spec={contest:'1',problem:'A',language:'GNU G++23'},saved=[];
 assert.equal(await confirmSubmission(input(['c','123B1','n']),spec,{saveProblem:x=>saved.push(x),log:()=>{}}),false);
 assert.deepEqual(saved,['123B1']);assert.equal(await confirmSubmission(input(['y']),spec),true);
});

test('新题顺序分配、重复题复用、逐文件默认题号、清空后从 A 重置并按新规则覆盖模板',async()=>{
 const {createProblemFile}=require('./files-server');const {clearDefaults,saveDefault,defaultFor,sequenceName}=require('./preferences');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cf-sequence-')),file=path.join(dir,'prefs.json');
 try{
  updatePreferences({languages:{cpp:'GNU G++23'}},file);
  const url=problem=>'https://codeforces.com/contest/2278/problem/'+problem;
  const a=await createProblemFile(dir,url('D'),file),b=await createProblemFile(dir,url('F'),file);
  assert.equal(a.name,'A.cpp');assert.equal(b.name,'B.cpp');
  fs.writeFileSync(a.path,'keep source');const repeated=await createProblemFile(dir,url('D'),file);assert.equal(repeated.name,'A.cpp');assert.equal(repeated.existed,true);
  assert.equal(defaultFor(a.path,readPreferences(file)),'2278D');assert.equal(defaultFor(b.path,readPreferences(file)),'2278F');
  await saveDefault(b.path,'1A',file);assert.equal(defaultFor(b.path,readPreferences(file)),'1A');assert.equal(defaultFor(a.path,readPreferences(file)),'2278D');
  await clearDefaults(file);let state=readPreferences(file);assert.equal(defaultFor(a.path,state),null);assert.deepEqual(state.assignments,{});assert.equal(state.languages.cpp,'GNU G++23');
  const reset=await createProblemFile(dir,url('E'),file);assert.equal(reset.name,'A.cpp');assert.equal(reset.existed,true);assert.equal(fs.readFileSync(a.path,'utf8'),DEFAULT_INITIAL_CONTENT);
  assert.equal((await createProblemFile(dir,url('G'),file)).name,'B.cpp');
  assert.equal(sequenceName(25),'Z.cpp');assert.equal(sequenceName(26),'AA.cpp');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('同时添加两个题不分配同一个文件',async()=>{
 const {createProblemFile}=require('./files-server');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cf-parallel-')),file=path.join(dir,'prefs.json');try{
 const results=await Promise.all(['D','E'].map(problem=>createProblemFile(dir,'https://codeforces.com/contest/2278/problem/'+problem,file)));
 assert.equal(new Set(results.map(r=>r.name)).size,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
