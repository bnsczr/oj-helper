const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {handle}=require('./native-host');
const {readPreferences,clearDefaults,saveDefault}=require('./preferences');
const {lastAddition,saveStatement,openStandings,main}=require('./open');
const {saveStandings}=require('./standings-report');
const {openInVSCode,findWindowsVSCode}=require('./editor');
const samples=[{input:'1\n\n2',output:'3'},{input:'4',output:'5'}];
test('未点击 + 时 open 无效，不能仅凭默认题号或手动 c 创建记录',()=>{
 for(const state of [{},{defaultProblem:'2278A'},{lastAddition:null}])assert.throws(()=>lastAddition(state),/没有添加记录/);
});
test('open s 保存覆盖完成后在 VS Code 打开同一个文件，启动失败也保留题面',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-open-editor-')),stateFile=path.join(directory,'state.json'),target=path.join(directory,'statement.md');
 try{
  await fs.writeFile(stateFile,JSON.stringify({lastAddition:{kind:'problem',contest:'2278',directory,statement:'# New statement'}}));
  await fs.writeFile(target,'previous statement');const opened=[],messages=[];
  await main(['s'],{stateFile,log:message=>messages.push(message),openEditor:async file=>{assert.equal(await fs.readFile(file,'utf8'),'# New statement');opened.push(file);}});
  assert.deepEqual(opened,[target]);assert.match(messages.at(-1),/VS Code.*statement\.md/);
  await assert.rejects(main(['s'],{stateFile,log:()=>{},openEditor:async()=>{throw Error('editor unavailable');}}),/editor unavailable/);
  assert.equal(await fs.readFile(target,'utf8'),'# New statement');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('VS Code 启动将含空格、中文及特殊字符的路径作为数据传入',async()=>{
 const target=path.resolve('folder with spaces',"题面 $() ` & statement.md"),calls=[];
 const editor={exe:'E:\\Microsoft VS Code\\_\\Code.exe',cli:'E:\\Microsoft VS Code\\_\\resources\\app\\out\\cli.js'};
 await openInVSCode(target,{platform:'win32',env:{VSCODE_IPC_HOOK_CLI:'existing-window'},run:async(...args)=>{calls.push(args);return {stdout:JSON.stringify(editor)};}});
 const [command,args,options]=calls[1];assert.equal(command,editor.exe);assert.equal(options.windowsHide,true);
 assert.deepEqual(args,[editor.cli,'--reuse-window','--',path.dirname(target),target]);assert.equal(options.cwd,path.dirname(target));assert.equal(options.env.VSCODE_CWD,path.dirname(target));assert.equal(options.env.ELECTRON_RUN_AS_NODE,'1');assert.equal(options.env.VSCODE_IPC_HOOK_CLI,'existing-window');
 assert.equal(calls[0][0],'powershell.exe');
 const batch=[];
 const files=[target,path.resolve('folder with spaces','B1.cpp'),path.resolve('folder with spaces','statement.md')];
 await openInVSCode(files,{platform:'win32',run:async(...args)=>{batch.push(args);return {stdout:JSON.stringify(editor)};}});
 assert.equal(batch.length,2);assert.deepEqual(batch[1][1],[editor.cli,'--reuse-window','--',path.dirname(target),...files]);assert.equal(batch[1][2].cwd,path.dirname(target));
 const other=[];
 await openInVSCode(target,{platform:'linux',run:async(...args)=>other.push(args)});
 assert.deepEqual(other[0][1],['--reuse-window','--',path.dirname(target),target]);assert.equal(other[0][2].cwd,path.dirname(target));
 await assert.rejects(openInVSCode(target,{run:async()=>{throw Error('not found');}}),/无法打开 VS Code/);
});
test('真实 PowerShell 发现非默认安装位置，兼容运行进程及旧注册位置下的 _ 子目录', {skip:process.platform!=='win32'},async()=>{
 const {promisify}=require('node:util'),execute=promisify(require('node:child_process').execFile);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-code-custom-'));
 try{
  const installation=path.join(directory,'Microsoft VS Code','_'),exe=path.join(installation,'Code.exe'),cli=path.join(installation,'resources','app','out','cli.js');
  await fs.mkdir(path.dirname(cli),{recursive:true});await fs.writeFile(exe,'');await fs.writeFile(cli,'');
  for(const running of [true,false]){
   const processPath=Buffer.from(exe).toString('base64'),registryPath=Buffer.from('"'+path.join(directory,'Microsoft VS Code','Code.exe')+'" "%1"').toString('base64');
   const found=await findWindowsVSCode({run:async(command,args,options)=>{
    const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
    const prelude=`function Get-Process { [CmdletBinding()]param($Name); ${running?"[pscustomobject]@{Path=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+processPath+"'))}":''} }
function Get-Command { [CmdletBinding()]param($Name,$CommandType) }
function Get-ItemProperty { [CmdletBinding()]param($LiteralPath); [pscustomobject]@{'(default)'=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${registryPath}'))} }
`;
    return execute(command,[...args.slice(0,-1),Buffer.from(prelude+script,'utf16le').toString('base64')],options);
   }});
   assert.equal(found.exe,exe);assert.equal(found.cli,cli);
  }
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('单题、Dashboard 和再次单题的最近记录持久化，open s 覆盖题面且保留所有样例',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-open-')),stateFile=path.join(directory,'state.json'),secretFile=path.join(directory,'secret');
 try{
  await fs.writeFile(secretFile,'paired');const options={secretFile,stateFile};
  const request={secret:'paired',directory,initialContent:'// template',samples};
  const first='# D. Test\n\n完整题面\n\nInput\n1\n\n2\nOutput\n3\nInput\n4\nOutput\n5\n';
  assert.equal((await handle({...request,action:'create',url:'https://codeforces.com/contest/2278/problem/D',statement:first},options)).defaultProblem,'2278D');
  let state=readPreferences(stateFile);assert.equal(state.lastAddition.kind,'problem');assert.equal(state.lastAddition.contest,'2278');
  const target=await saveStatement(state);assert.equal(target,path.join(directory,'statement.md'));assert.equal(await fs.readFile(target,'utf8'),first);
  await saveDefault(path.join(directory,'A.cpp'),'1B',stateFile);assert.equal(readPreferences(stateFile).lastAddition.contest,'2278');
  const problems=['A','B1'].map(index=>({index,samples,statement:'# '+index+'. Problem\n\nDescription '+index+'\n\nAll samples: 1 2 3 4 5\n'}));
  const batch=await handle({...request,action:'create-dashboard',url:'https://codeforces.com/contest/123',problems},options);assert.equal(batch.files.length,2);
  state=readPreferences(stateFile);assert.equal(state.lastAddition.kind,'contest');assert.equal(state.lastAddition.contest,'123');
  await saveStatement(state);const full=await fs.readFile(target,'utf8');assert.match(full,/# A\. Problem/);assert.match(full,/# B1\. Problem/);assert.equal(full.split('All samples').length-1,2);assert.doesNotMatch(full,/# D\. Test/);
  const before=state.lastAddition;
  assert.ok((await handle({...request,action:'create-dashboard',url:'https://codeforces.com/contest/1',problems:[{index:'A',samples:[]}]},options)).error);assert.deepEqual(readPreferences(stateFile).lastAddition,before);
  await handle({...request,action:'create',url:'https://codeforces.com/problemset/problem/999/C',statement:'# C. Latest'},options);
  await saveStatement(readPreferences(stateFile));assert.equal(await fs.readFile(target,'utf8'),'# C. Latest');
  await clearDefaults(stateFile);assert.throws(()=>lastAddition(readPreferences(stateFile)),/没有添加记录/);
  assert.equal(await fs.readFile(target,'utf8'),'# C. Latest');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('题面缺失或 statement.md 不是普通文件时给出错误',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-open-invalid-'));
 try{
  const state={lastAddition:{kind:'problem',contest:'2278',directory,statement:null}};
  await assert.rejects(saveStatement(state),/重新点击/);
  await fs.mkdir(path.join(directory,'statement.md'));state.lastAddition.statement='# Test';
  await assert.rejects(saveStatement(state),/不是普通文件/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('open b 经真实本地桥接让浏览器扩展新开榜单标签并返回成功，失败时返回原因',async()=>{
 const state={lastAddition:{kind:'problem',contest:'2278',directory:os.tmpdir(),section:'contest'}};
 for(const fail of [false,true]){
  const created=[],requests=[];let started;
  const listening=new Promise(resolve=>started=resolve);
  const result=openStandings(state,{secret:'paired',timeout:10000,port:0,log:()=>{},onListening:started});
  const settled=result.then(()=>({ok:true}),error=>({error}));const port=await listening;
  const statistics={kind:'friends-standings',contest:'2278',section:'contest',url:'https://codeforces.com/contest/2278/standings/friends/true',handle:'TestUser',showUnofficial:true,headers:['#','Who','=','Penalty','A','Δ Final'],rows:Array.from({length:500},(_,index)=>[String(index+1),'用户 TestUser '+index,'4','321','+1\n00:19','+71'])};
  const chrome={storage:{local:{get:async()=>({bridgeSecret:'paired'})}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:()=>{}}},tabs:{create:async options=>{created.push(options);if(fail)throw Error('无法打开');return {id:8};},get:async()=>({status:'complete'})},scripting:{executeScript:async()=>[{result:{snapshot:statistics}}]}};
  const context={chrome,AbortSignal,setTimeout,fetch:async(url,options)=>{requests.push(url);return fetch(url.replace('127.0.0.1:27121','127.0.0.1:'+port),options);}};
  vm.runInNewContext(sync.readFileSync(require.resolve('./extension/standings'),'utf8')+'\n'+sync.readFileSync(require.resolve('./extension/worker'),'utf8'),context);
  const outcome=await settled;assert.equal(created.length,1,JSON.stringify({fail,requests,error:outcome.error?.message}));assert.equal(created[0].url,'https://codeforces.com/contest/2278/standings/friends/true?showUnofficial=true');assert.equal(created[0].active,true);
  assert.equal(requests.length,2);assert.match(requests[1],/\/result\?token=/);
  if(fail)assert.match(outcome.error.message,/打开榜单失败/);else {assert.equal(outcome.ok,true);assert.deepEqual(await result,statistics);assert.ok(Buffer.byteLength(JSON.stringify(statistics))>10000);}
 }
});

test('open b 覆盖完整好友榜单并在 VS Code 打开，格式错误或比赛不匹配不覆盖',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cf-friends-report-')),stateFile=path.join(directory,'state.json'),target=path.join(directory,'standings.md');
 try{
  const addition={kind:'contest',contest:'2278',section:'contest',directory};await fs.writeFile(stateFile,JSON.stringify({lastAddition:addition}));
  await fs.writeFile(target,'old report');const opened=[],messages=[];
  const snapshot={kind:'friends-standings',contest:'2278',section:'contest',url:'https://codeforces.com/contest/2278/standings/friends/true',title:'Final standings',showUnofficial:true,headers:['#','Who','=','Penalty','A','Δ Final'],rows:[['1 (224)','Friend','6','237','+1\n00:19','+71'],['','* TheSunrise','6','','+3','N/A']]};
  await main(['b'],{stateFile,openBoard:async()=>snapshot,log:message=>messages.push(message),openEditor:async file=>{assert.match(await fs.readFile(file,'utf8'),/Friend/);opened.push(file);}});
  assert.deepEqual(opened,[target]);const markdown=await fs.readFile(target,'utf8');assert.match(markdown,/1 \(224\)/);assert.match(markdown,/\+1<br>00:19/);assert.match(markdown,/TheSunrise/);assert.match(markdown,/237/);assert.doesNotMatch(markdown,/old report/);assert.match(messages.at(-1),/VS Code.*standings\.md/);
  for(const invalid of [{found:true,solved:6},{...snapshot,contest:'1'},{...snapshot,url:'https://codeforces.com/contest/2278/standings'}]){
   await assert.rejects(saveStandings(addition,invalid));assert.equal(await fs.readFile(target,'utf8'),markdown);
  }
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
