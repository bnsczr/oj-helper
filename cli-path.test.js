const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {resolveSourceFile}=require('./cli');
const {fileKey,defaultFor}=require('./preferences');

function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cf-submit-path-'));
 const cwd=path.join(root,'home'),directory=path.join(root,'saved files');
 fs.mkdirSync(cwd);fs.mkdirSync(directory);
 const file=path.join(directory,'B.cpp');fs.writeFileSync(file,'int main(){}');
 const state={lastAddition:{kind:'contest',contest:'2278',directory},defaultProblem:'2278D',fileProblems:{[fileKey(file)]:'2278B'}};
 return {root,cwd,directory,file,state};
}

test('从其他目录 submit B.cpp 使用保存目录中的源码、逐文件题号，并仍需确认提交',()=>{
 const {root,cwd,file,state}=fixture();
 try{
  const tool=path.join(root,'tool');fs.mkdirSync(tool);
  for(const name of ['cli.js','preferences.js','bridge.js','wakeup.js'])fs.copyFileSync(path.join(__dirname,name),path.join(tool,name));
  fs.writeFileSync(path.join(tool,'.submit-preferences.json'),JSON.stringify(state));
  const result=spawnSync(process.execPath,[path.join(tool,'cli.js'),'B.cpp'],{cwd,input:'n\n',encoding:'utf8',timeout:10000});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  assert.ok(result.stdout.includes('文件：'+file));assert.match(result.stdout,/题目：2278B，语言：GNU G\+\+23/);assert.match(result.stdout,/已取消/);
  assert.equal(fs.existsSync(path.join(tool,'.bridge-secret')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('当前目录已有同名源码时优先使用该文件及其映射',()=>{
 const {root,cwd,state}=fixture();
 try{
  const local=path.join(cwd,'B.cpp');fs.writeFileSync(local,'// local');state.fileProblems[fileKey(local)]='123B1';
  const resolved=resolveSourceFile('B.cpp',state,{cwd});assert.equal(resolved,local);assert.equal(defaultFor(resolved,state),'123B1');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('显式路径不回退，清空记录后不继续使用原保存目录',()=>{
 const {root,cwd,file,state}=fixture();
 try{
  assert.equal(resolveSourceFile('.'+path.sep+'B.cpp',state,{cwd}),path.join(cwd,'B.cpp'));
  assert.equal(resolveSourceFile(path.join('other','B.cpp'),state,{cwd}),path.join(cwd,'other','B.cpp'));
  assert.equal(resolveSourceFile(file,state,{cwd}),file);
  for(const cleared of [{},{lastAddition:null},{lastAddition:{directory:'relative'}}])assert.equal(resolveSourceFile('B.cpp',cleared,{cwd}),path.join(cwd,'B.cpp'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
