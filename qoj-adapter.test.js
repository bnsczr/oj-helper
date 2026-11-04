const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {qojTarget,qojDashboard}=require('./extension/qoj');
const {page,account,form,submission,card,zip,pdfDocument}=require('./test-support/qoj-fixtures');
const {zipSamples,createQojFiles}=require('./qoj-files');
const {readPreferences,clearDefaults,languageFor,fileKey}=require('./preferences');
const {handle}=require('./native-host');
const plain=value=>JSON.parse(JSON.stringify(value));
const resource=(bytes,problem,type)=>({url:'https://qoj.ac/download.php?id='+problem+'&type='+type,base64:bytes.toString('base64')});

test('QOJ 数字题号、比赛题目和语言页面严格识别，不接受其他站点或详情页',()=>{
 assert.equal(qojTarget('123').url,'https://qoj.ac/problem/123');assert.equal(qojTarget('https://qoj.ac/contest/42/problem/123/statement/zh_cn').contest,'42');
 assert.equal(qojDashboard('https://qoj.ac/contest/42').contest,'42');assert.equal(qojDashboard('https://qoj.ac/contest/42/submissions'),null);
 for(const value of ['0','1A','https://evil.test/problem/123','https://qoj.ac.evil.test/problem/123','https://user@qoj.ac/problem/123','https://qoj.ac/submission/123'])assert.throws(()=>qojTarget(value));
});
test('QOJ 真实 Dashboard 结构读取字母到数字映射及 External Standings 入口',()=>{
 const p=page('<table><tbody><tr><td>A</td><td><a href="/contest/42/problem/123">First</a></td></tr><tr><td>B</td><td><a href="/contest/42/problem/124">Second</a></td></tr></tbody></table><a href="/results/QOJ42">External Standings</a>','https://qoj.ac/contest/42');
 const result=p.run('readQojDashboard()');assert.deepEqual(plain(result.problems.map(p=>[p.index,p.problem])),[['A','123'],['B','124']]);assert.equal(result.extraUrl,'https://qoj.ac/results/QOJ42');
});

test('QOJ 真实 nav-pills 登录区域识别当前账号，不误取提交列表中的其他人',()=>{
 const p=page('<div class="container"><div><ul class="nav nav-pills float-right"><li class="nav-item dropdown"><a class="nav-link dropdown-toggle"><a class="uoj-username" href="//qoj.ac/user/profile/CurrentUser">CurrentUser</a></a></li></ul></div></div>'+submission(),'https://qoj.ac/contest/42/submissions');
 assert.equal(p.run('qojAccount()'),'CurrentUser');
 p.document.querySelector('.nav').remove();assert.equal(p.run('qojAccount()'),null);
});
test('QOJ PDF 与附件使用真实下载路径，HTML 样例保留多组，多文件题明确拒绝',()=>{
 const p=page(account+'<h1 class="text-center">A. Example</h1><div id="tab-statement"><iframe id="statements-pdf" src="/download.php?type=statement&id=123&contest_id=42"></iframe></div><a href="/download.php?type=problem&id=123&contest_id=42">Attachments</a>'+form,'https://qoj.ac/contest/42/problem/123');
 const result=p.run('readQojProblemPage()');assert.match(result.problem.pdfUrl,/type=statement/);assert.match(result.problem.attachmentUrl,/type=problem/);
 p.document.querySelector('#tab-statement').innerHTML='<h3>Sample Input 1</h3><pre>1\n\n2</pre><h3>Sample Output 1</h3><pre>3</pre><h3>Sample Input 2</h3><pre>4</pre><h3>Sample Output 2</h3><pre>5</pre>';
 assert.deepEqual(plain(p.run('readQojProblemPage().problem.samples')),[{input:'1\n\n2',output:'3'},{input:'4',output:'5'}]);
 p.document.querySelector('#form-answer').insertAdjacentHTML('beforeend','<div id="form-group-answer_config"></div>');assert.match(p.run('readQojProblemPage().error'),/多文件/);
});
test('QOJ 最后普通 Test 的 checker 不受 Extra Test 和源码输出混淆',()=>{
 const p=page(account+submission()+'<div id="details_details_accordion">'+card(1,'first')+card(25,'ok last ordinary')+card(1,'extra-one',true)+card(2,'extra-two',true)+'</div>','https://qoj.ac/submission/101');
 const result=p.run('readQojJudgement()');assert.equal(result.test,'Test #25');assert.equal(result.checker,'ok last ordinary');assert.equal(result.record.language,'C++23');assert.equal(result.record.score,'100');
 p.document.querySelector('#details_details_accordion').innerHTML=card(1,'extra-only',true);assert.equal(p.run('readQojJudgement().checker'),null);
 p.document.querySelector('.uoj-score').textContent='Judging';assert.equal(p.run('readQojJudgement().waiting'),true);
});
test('QOJ External Standings 读取完整原始表格，保留题号统计和换行并核对比赛',()=>{
 const p=page('<h2>Example contest</h2><a href="https://qoj.ac/contest/42">Enter Contest</a><table class="standings"><tbody><tr><th>Rank.</th><th>Username</th><th>A<br>10/20</th><th>Solved</th><th>Penalty</th></tr><tr><td>1</td><td>Team</td><td>+1<br>0:23</td><td>1</td><td>43</td></tr></tbody></table>','https://qoj.ac/results/QOJ42');
 const result=p.run('readQojExternalStandings({contest:"42"})');assert.deepEqual(plain(result.snapshot.headers),['Rank.','Username','A\n10/20','Solved','Penalty']);assert.equal(result.snapshot.rows[0][2],'+1\n0:23');assert.match(p.run('readQojExternalStandings({contest:"43"}).error'),/未关联/);
});
test('QOJ ZIP 样例按文件配对且校验，其他附件不写入磁盘',()=>{
 const bytes=zip({'samples/10.in':'10\r\n','samples/10.out':'20\r\n','samples/2.in':'2','samples/2.ans':'4','../unrelated.cpp':'ignore'});
 assert.deepEqual(zipSamples(bytes),[{input:'2',output:'4'},{input:'10\n',output:'20\n'}]);
 assert.throws(()=>zipSamples(zip({'1.in':'one'})),/缺少输入或输出/);
 const broken=zip({'1.in':'one','1.out':'two'},{compressed:false});broken[34]^=1;assert.throws(()=>zipSamples(broken),/校验失败/);
});
test('QOJ 文件保存 PDF、全部样例与逐文件映射，clear 仅清 QOJ 且不损失 CF',async()=>{
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'qoj-create-')),stateFile=path.join(directory,'state.json');
 try{
  const cf={defaultProblem:'1A',fileProblems:{[fileKey(path.join(directory,'A.cpp'))]:'1A'},languages:{cpp:'GNU G++20'}};await fsp.writeFile(stateFile,JSON.stringify({...cf,activeOj:'qoj'}));
  const pdf=pdfDocument([['Full problem description','Input','Output']]),attachment=resource(zip({'1.in':'1','1.out':'2','2.in':'3','2.out':'4'}),'123','problem');
  const problem={url:'https://qoj.ac/contest/42/problem/123',statement:'# Example',samples:[],pdf:resource(pdf,'123','statement'),attachment};
  const result=await createQojFiles({action:'qoj-create',directory,problem,initialContent:'// template'},stateFile);
  assert.equal(result.name,'A.cpp');assert.match(await fsp.readFile(result.path,'utf8'),/样例 2/);assert.deepEqual(await fsp.readFile(path.join(directory,'statements','QOJ-123.pdf')),pdf);
  let state=readPreferences(stateFile);assert.match(state.qoj.lastAddition.statement,/statements\/QOJ-123.pdf/);assert.match(state.qoj.lastAddition.statement,/### 样例 1[\s\S]*输入：[\s\S]*1[\s\S]*输出：[\s\S]*2[\s\S]*### 样例 2[\s\S]*输入：[\s\S]*3[\s\S]*输出：[\s\S]*4/);assert.equal(state.qoj.fileProblems[fileKey(result.path)],problem.url);assert.equal(state.defaultProblem,'1A');assert.equal(languageFor('A.cpp',state),'C++23');
  await clearDefaults(stateFile);state=readPreferences(stateFile);assert.equal(state.qoj.defaultProblem,null);assert.equal(state.defaultProblem,'1A');assert.deepEqual(state.languages,cf.languages);
 }finally{await fsp.rm(directory,{recursive:true,force:true});}
});
test('QOJ 批量预检失败不覆盖任何源码，附件解析失败明确反馈',async()=>{
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'qoj-batch-')),stateFile=path.join(directory,'state.json');
 try{
  await fsp.writeFile(path.join(directory,'A.cpp'),'keep');const first={url:'https://qoj.ac/contest/42/problem/123',index:'A',statement:'# A',samples:[{input:'1',output:'2'}]};
  await assert.rejects(createQojFiles({action:'qoj-create-dashboard',directory,url:'https://qoj.ac/contest/42',problems:[first,{...first,index:'B',unsupported:'多文件题'}]},stateFile),/多文件/);assert.equal(await fsp.readFile(path.join(directory,'A.cpp'),'utf8'),'keep');
  const result=await createQojFiles({action:'qoj-create',directory,problem:{...first,samples:[],attachment:resource(zip({'1.in':'missing answer'}),'123','problem')}},stateFile);
  assert.ok(result.warnings.some(message=>message.includes('样例读取不完整')));
 }finally{await fsp.rm(directory,{recursive:true,force:true});}
});
test('QOJ 本机助手遵循四个自动打开开关，结果不回传整场题面',async()=>{
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'qoj-native-')),stateFile=path.join(directory,'state.json'),secretFile=path.join(directory,'secret');
 try{
  await fsp.writeFile(secretFile,'paired');const opened=[];const result=await handle({action:'qoj-create',secret:'paired',directory,openAfterAdd:{problemCpp:true,problemStatement:true},problem:{url:'https://qoj.ac/problem/123',statement:'# Test',samples:[{input:'1',output:'2'}]}},{secretFile,stateFile,openEditor:async files=>opened.push(files)});
  assert.equal(result.error,undefined);assert.equal(result.addition,undefined);assert.deepEqual(opened,[[path.join(directory,'A.cpp'),path.join(directory,'statement.md')]]);assert.match(await fsp.readFile(path.join(directory,'statement.md'),'utf8'),/^# Test[\s\S]*### 样例 1[\s\S]*输入：[\s\S]*1[\s\S]*输出：[\s\S]*2/);
 }finally{await fsp.rm(directory,{recursive:true,force:true});}
});
test('QOJ 浏览器任务按账号、题目、语言核对且单次点击，完成后返回普通 Test checker',async()=>{
 const store=new Map(),events=[],navigations=[];let clicks=0;
 const job={oj:'qoj',problem:'123',contest:'42',url:'https://qoj.ac/contest/42/problem/123',source:'int main(){}',language:'C++23',fileName:'A.cpp'};
 const script=fs.readFileSync(require.resolve('./extension/qoj-content'),'utf8');
 const shared={sessionStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},history:{replaceState:()=>{}},chrome:{runtime:{sendMessage:async message=>{if(message.result){events.push(message.result);return {data:{}};}return {data:job};}}},setTimeout:callback=>setImmediate(callback)};
 let current=page(account+submission(100),'https://qoj.ac/contest/42/submissions#qojhelper=27121:'+'a'.repeat(48),shared);current.context.location.assign=url=>navigations.push(url);
 await vm.runInContext(script,current.context);assert.deepEqual(navigations,[job.url]);
 const FakeFile=class{constructor(chunks,name){this.source=chunks.join('');this.name=name;}};
 const FakeTransfer=class{constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}};
 current=page(account+'<h1 class="text-center">Example</h1><div id="tab-statement">Statement</div>'+form,job.url,{...shared,File:FakeFile,DataTransfer:FakeTransfer});
 const language=current.document.querySelector('select');let selected='C++23';Object.defineProperty(language,'value',{get:()=>selected,set:value=>selected=value});
 const file=current.document.querySelector('input[type="file"]');current.document.querySelector('button').click=()=>{clicks++;assert.equal(file.files[0].source,job.source);assert.ok(store.has('ojhelper-qoj-pending'));};current.document.contains=()=>false;
 await vm.runInContext(script,current.context);assert.equal(clicks,1);
 current=page(account+submission(101)+'<div id="details_details_accordion">'+card(25,'last-checker')+card(2,'ignore-extra',true)+'</div>','https://qoj.ac/submission/101',shared);
 await vm.runInContext(script,current.context);assert.match(events.at(-1).message,/AC.*Test #25.*last-checker/);assert.equal(events.at(-1).final,true);assert.equal(clicks,1);assert.equal(store.has('ojhelper-qoj-pending'),false);
});
