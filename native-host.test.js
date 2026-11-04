const {appendSamples}=require('./samples');
const {DEFAULT_INITIAL_CONTENT}=require('./extension/template');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {handle,encode}=require('./native-host');const {readPreferences}=require('./preferences');
const {detectExtensionIds}=require('./native-install');
test('无需 HTTP 服务的本机助手：认证、创建、保留源码及更新题号',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-native-'));const secretFile=path.join(dir,'secret'),stateFile=path.join(dir,'prefs.json');
 try{
  await fs.writeFile(secretFile,'paired');const options={secretFile,stateFile};
  const request={action:'create',secret:'paired',directory:dir,url:'https://codeforces.com/contest/1/problem/A'};
  assert.match((await handle({...request,secret:'bad'},options)).error,/配对码/);
  assert.match((await handle({...request,action:'execute'},options)).error,/未知操作/);
  assert.match((await handle({...request,url:'https://example.com/'},options)).error,/Codeforces/);
  assert.equal((await handle(request,options)).name,'A.cpp');
  await fs.writeFile(path.join(dir,'A.cpp'),'keep source');
  const result=await handle({...request,url:'https://codeforces.com/contest/2278/problem/F'},options);
  assert.equal(result.name,'B.cpp');assert.equal(result.existed,false);assert.equal(result.defaultProblem,'2278F');assert.equal(readPreferences(stateFile).defaultProblem,'2278F');assert.equal(await fs.readFile(path.join(dir,'A.cpp'),'utf8'),'keep source');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
function invoke(command,args,input,keepOpen=false){return new Promise((resolve,reject)=>{
 const child=spawn(command,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});const chunks=[],errors=[];
 const timer=setTimeout(()=>{child.kill();reject(Error('本机连接超时'));},10000);
 child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>errors.push(c));child.on('error',e=>{clearTimeout(timer);reject(e);});
 child.on('exit',code=>{clearTimeout(timer);if(code!==0)return reject(Error(Buffer.concat(errors).toString()||'进程退出：'+code));const buffer=Buffer.concat(chunks);try{assert.equal(buffer.readUInt32LE(),buffer.length-4);resolve(JSON.parse(buffer.subarray(4).toString()));}catch(e){reject(e);}});
 child.stdin.on('error',()=>{});
 // The framing parser must handle headers and payload arriving separately.
 child.stdin.write(input.subarray(0,2));setTimeout(()=>{if(keepOpen)child.stdin.write(input.subarray(2));else child.stdin.end(input.subarray(2));},20);
});}
test('浏览器消息的二进制分帧及错误回传无额外输出',async()=>{
 const result=await invoke(process.execPath,[path.join(__dirname,'native-host.js')],encode({action:'create',secret:'not-paired'}));assert.ok(result.error);
});
test('已编译的无窗口启动器可传递浏览器消息',async t=>{
 const launcher=path.join(__dirname,'.native-host','launcher-v5.exe');try{await fs.access(launcher);}catch{return t.skip('未编译启动器');}
 const result=await invoke(launcher,[],encode({action:'create',secret:'not-paired'}),true);assert.ok(result.error);
});
test('自动检测扩展只返回本助手 ID',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-detect-'));try{
 const profile=path.join(dir,'Microsoft/Edge/User Data/Default');await fs.mkdir(profile,{recursive:true});
 const id='a'.repeat(32),legacyId='c'.repeat(32);await fs.writeFile(path.join(profile,'Secure Preferences'),JSON.stringify({extensions:{settings:{[id]:{manifest:{name:'oj-helper'}},[legacyId]:{manifest:{name:'Codeforces Helper Local'}},['b'.repeat(32)]:{manifest:{name:'Other'}}}}}));
 assert.deepEqual(detectExtensionIds(dir),[id,legacyId]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('真实启动器保持浏览器输入开启也能完成创建并返回题号',async t=>{
 const executable=path.join(__dirname,'.native-host','launcher-v5.exe');try{await fs.access(executable);}catch{return t.skip('未编译启动器');}
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-native-live-'));try{
  const launcherDir=path.join(dir,'.native-host');await fs.mkdir(launcherDir);const launcher=path.join(launcherDir,'launcher-v3.exe');await fs.copyFile(executable,launcher);await fs.writeFile(path.join(launcherDir,'node-path.txt'),process.execPath);
  const secretFile=path.join(dir,'secret'),stateFile=path.join(dir,'prefs.json');await fs.writeFile(secretFile,'paired');
  await fs.writeFile(path.join(dir,'native-host.js'),'require('+JSON.stringify(path.join(__dirname,'native-host.js'))+').run('+JSON.stringify({secretFile,stateFile})+');');
  const samples=[{input:'1\n'.repeat(15000),output:'ok'}];
  const result=await invoke(launcher,[],encode({action:'create',secret:'paired',directory:dir,url:'https://codeforces.com/contest/2278/problem/D',samples}),true);
  assert.equal(result.name,'A.cpp');assert.equal(result.defaultProblem,'2278D');assert.equal(await fs.readFile(path.join(dir,'A.cpp'),'utf8'),appendSamples(DEFAULT_INITIAL_CONTENT,samples));assert.equal(readPreferences(stateFile).defaultProblem,'2278D');
  // Exercise the browser's real launcher with automatic opening enabled, while
  // recording the editor request rather than opening a GUI in the test suite.
  const openedFile=path.join(dir,'opened.json');
  await fs.writeFile(path.join(dir,'native-host.js'),'require('+JSON.stringify(path.join(__dirname,'native-host.js'))+').run({...'+JSON.stringify({secretFile,stateFile})+',openEditor:async files=>require("node:fs").writeFileSync('+JSON.stringify(openedFile)+',JSON.stringify(files))});');
  const batch=await invoke(launcher,[],encode({action:'create-dashboard',secret:'paired',directory:dir,url:'https://codeforces.com/contest/2278',openAfterAdd:{},problems:['A','B1'].map(index=>({index,samples:[{input:'1',output:'2'}],statement:'# '+index+'. Problem\n\nInput 1 Output 2'}))}),true);
  assert.equal(batch.error,undefined);assert.equal(batch.warnings,undefined);
  assert.deepEqual(JSON.parse(await fs.readFile(openedFile,'utf8')),['A.cpp','B1.cpp','statement.md'].map(name=>path.join(dir,name)));
  assert.match(await fs.readFile(path.join(dir,'statement.md'),'utf8'),/# B1\. Problem/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('本机助手使用自定义模板覆盖整个文件，支持显式空模板',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-template-'));const secretFile=path.join(dir,'secret'),stateFile=path.join(dir,'prefs.json');
 try{
  await fs.writeFile(secretFile,'paired');const options={secretFile,stateFile};const request={action:'create',secret:'paired',directory:dir,url:'https://codeforces.com/contest/2278/problem/D'};
  const custom='// 中文模板\nint main() { return 0; }\n';
  const first=await handle({...request,initialContent:custom},options);assert.equal(await fs.readFile(first.path,'utf8'),custom);
  await fs.writeFile(first.path,'previous longer source '.repeat(30));
  const second=await handle({...request,initialContent:custom},options);assert.equal(second.existed,true);assert.equal(second.name,'A.cpp');assert.equal(await fs.readFile(first.path,'utf8'),custom);
  await handle({...request,initialContent:''},options);assert.equal(await fs.readFile(first.path,'utf8'),'');
  assert.match((await handle({...request,initialContent:123},options)).error,/初始内容/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
