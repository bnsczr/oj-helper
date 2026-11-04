const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {once}=require('node:events');
const {createBridge}=require('./bridge');
function chromeBase(settings={}){return {storage:{local:{get:async()=>({bridgeSecret:'paired',directory:'E:/code',...settings})}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:()=>{}}},tabs:{}};}
function code(name){return fs.readFileSync(require.resolve('./extension/'+name),'utf8');}
test('QOJ 提交经真实本地桥接即时领取，只在后台打开 QOJ 状态页',async()=>{
 const server=createBridge({secret:'paired',token:'a'.repeat(48),job:{oj:'qoj',contest:'42',problem:'123'},onEvent:()=>{}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const created=[],chrome=chromeBase();chrome.tabs.create=async options=>created.push(options);
 try{
  const port=server.address().port;vm.runInNewContext(code('worker'),{chrome,AbortSignal,fetch:(url,options)=>fetch(url.replace('127.0.0.1:27121','127.0.0.1:'+port),options)});
  for(let i=0;i<20&&!created.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(created.length,1);assert.equal(created[0].active,false);assert.equal(created[0].url,'https://qoj.ac/contest/42/submissions#qojhelper=27121:'+'a'.repeat(48));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('QOJ 批量只复用一个后台标签页，全部读取后一次调用本机助手',async()=>{
 const chrome=chromeBase(),created=[],updated=[],removed=[],sent=[];let current='https://qoj.ac/contest/42/problem/123';
 const listed={problems:[{index:'A',url:current},{index:'B',url:'https://qoj.ac/contest/42/problem/124'}]};
 chrome.tabs={create:async options=>{created.push(options);return {id:10};},update:async(id,options)=>{updated.push(options);current=options.url;},get:async()=>({status:'complete'}),remove:async id=>removed.push(id)};
 chrome.runtime.sendNativeMessage=async(name,message)=>{sent.push(message);return {files:message.problems.map(problem=>({name:problem.index+'.cpp'}))};};
 chrome.scripting={executeScript:async options=>options.files?[]:[{result:options.func.name==='readQojDashboard'?listed:{problem:{url:current,statement:'# test',samples:[{input:'1',output:'2'}]}}}]};
 const context=vm.createContext({chrome,Date,URL,AbortSignal,setTimeout,clearTimeout,readQojDashboard:()=>{},readQojProblemPage:()=>{},fetch:()=>assert.fail('没有附件时不得额外抓取')});vm.runInContext(code('qoj')+'\n'+code('qoj-worker'),context);
 await vm.runInContext('qojAddFromTab(1,"https://qoj.ac/contest/42")',context);
 assert.equal(created.length,1);assert.equal(created[0].active,false);assert.equal(updated.length,1);assert.deepEqual(removed,[10]);assert.equal(sent.length,1);assert.equal(sent[0].action,'qoj-create-dashboard');assert.equal(sent[0].problems.length,2);
});
test('QOJ External Standings 依据真实入口新标签跳转，没有入口时不偷偷换普通榜单',async()=>{
 const chrome=chromeBase(),created=[],updated=[];chrome.tabs={create:async options=>{created.push(options);return{id:10};},update:async(id,options)=>updated.push(options)};
 const context=vm.createContext({chrome,readQojDashboard:()=>{},readQojExternalStandings:()=>{}});vm.runInContext(code('qoj-worker'),context);
 let missing=false;context.qojReadTab=async(id,func)=>func.name==='readQojDashboard'?{extraUrl:missing?null:'https://qoj.ac/results/QOJ42'}:{snapshot:{kind:'external-standings'}};
 const result=await vm.runInContext('openQojStandingsTab({contest:"42"})',context);assert.equal(result.kind,'external-standings');assert.equal(created[0].active,true);assert.equal(updated[0].url,'https://qoj.ac/results/QOJ42');
 missing=true;await assert.rejects(vm.runInContext('openQojStandingsTab({contest:"42"})',context),/没有可读取/);assert.equal(updated.length,1);
});
test('QOJ 附件下载验证题号和类型，并对登录 HTML 明确报错',async()=>{
 const context=vm.createContext({URL,AbortSignal,Uint8Array,btoa,fetch:async()=>({ok:true,url:'https://qoj.ac/login',headers:{get:()=> 'text/html'}})});vm.runInContext(code('qoj-worker'),context);
 await assert.rejects(vm.runInContext('qojResource("https://evil.test/download.php?id=123&type=statement","123","statement")',context),/不匹配/);
 await assert.rejects(vm.runInContext('qojResource("https://qoj.ac/download.php?id=123&type=statement","123","statement")',context),/需要登录或网页验证/);
});
test('QOJ 页面脚本无响应时按时返回错误，不永久挂起',async()=>{
 const chrome={scripting:{executeScript:()=>new Promise(()=>{})}},context=vm.createContext({chrome,setTimeout,clearTimeout});vm.runInContext(code('qoj-worker'),context);
 await assert.rejects(vm.runInContext('qojScript({target:{tabId:1}},5)',context),/脚本读取超时/);
});
test('真实背景脚本 importScripts 依赖完整加载，轮询声明 CF 与 QOJ 能力',async()=>{
 const chrome=chromeBase(),requests=[],context=vm.createContext({chrome,AbortSignal,URL,Date,setTimeout,clearTimeout,fetch:async(url,options)=>{requests.push(options);return {ok:true,json:async()=>({})};}});
 context.importScripts=(...files)=>files.forEach(file=>vm.runInContext(code(file.replace(/\.js$/,'')),context));
 vm.runInContext(code('worker'),context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof context.qojCollectProblem,'function');assert.equal(typeof context.readQojJudgement,'function');assert.equal(requests[0].headers['X-Oj-Helper-Platforms'],'cf,qoj');
});
