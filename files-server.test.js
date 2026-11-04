const {DEFAULT_INITIAL_CONTENT}=require('./extension/template');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {readPreferences}=require('./preferences');
const {problemFromUrl}=require('./extension/problem');const {createProblemFile,createFilesServer}=require('./files-server');
test('只从 Codeforces 题目网址提取文件名',()=>{
 for(const url of ['https://codeforces.com/problemset/problem/2278/F','https://codeforces.com/contest/2278/problem/F?locale=en#x','https://www.codeforces.com/contest/2278/problem/f/'])assert.equal(problemFromUrl(url),'2278F.cpp');
 assert.equal(problemFromUrl('https://codeforces.com/gym/100001/problem/A1'),'100001A1.cpp');
 for(const url of ['https://codeforces.com/','https://codeforces.com/problemset','https://codeforces.com/contest/2278','https://codeforces.com/problemset/submit?contestId=2278&problemIndex=F','https://codeforces.com.evil.test/contest/2278/problem/F','https://evil.test/contest/2278/problem/F','https://codeforces.com/contest/2278/problem/F/extra','file:///1A','https://codeforces.com:123/contest/1/problem/A'])assert.throws(()=>problemFromUrl(url));
});
test('按设置创建文件、无目录不创建、同名覆盖初始内容',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-browser-'));const stateFile=path.join(dir,'prefs.json');const url='https://codeforces.com/contest/1/problem/A';
 try{await assert.rejects(createProblemFile('',url,stateFile),/尚未设置/);await assert.rejects(createProblemFile('relative',url,stateFile),/绝对路径/);
  const first=await createProblemFile(dir,url,stateFile);assert.equal(first.path,path.join(dir,'A.cpp'));assert.equal(first.existed,false);
  await fs.writeFile(first.path,'keep');const second=await createProblemFile(dir,url,stateFile);assert.equal(second.existed,true);
  const changed=await createProblemFile(dir,'https://codeforces.com/contest/2278/problem/F',stateFile);assert.equal(changed.name,'B.cpp');assert.equal(changed.existed,false);assert.equal(readPreferences(stateFile).defaultProblem,'2278F');assert.equal(await fs.readFile(first.path,'utf8'),DEFAULT_INITIAL_CONTENT);
  await assert.rejects(createProblemFile(dir,'https://example.com/',stateFile),/不是 Codeforces/);assert.deepEqual(await fs.readdir(dir),['A.cpp','B.cpp','prefs.json']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('文件服务认证及浏览器设置目录的完整请求',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-files-http-'));const stateFile=path.join(dir,'prefs.json');const server=createFilesServer('paired',stateFile);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/create`;
 try{
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  const headers={Authorization:'Bearer paired','Content-Type':'application/json'};
  const noPath=await fetch(url,{method:'POST',headers,body:JSON.stringify({url:'https://codeforces.com/contest/1/problem/A'})});assert.equal(noPath.status,400);
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({directory:dir,url:'https://codeforces.com/contest/1/problem/A'})});assert.equal(response.status,200);const result=await response.json();assert.equal(result.name,'A.cpp');assert.equal(result.defaultProblem,'1A');assert.equal(readPreferences(stateFile).defaultProblem,'1A');assert.equal(await fs.readFile(path.join(dir,'A.cpp'),'utf8'),DEFAULT_INITIAL_CONTENT);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
