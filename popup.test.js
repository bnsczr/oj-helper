const {autoOpenSummary}=require('./extension/open-settings');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');const {problemFromUrl,dashboardFromUrl}=require('./extension/problem');const {readSamples}=require('./extension/samples');const {readDashboard}=require('./extension/dashboard');const {readStatement}=require('./extension/statement');
async function popup({directory='C:/code',fail=false,name='A.cpp',dashboard=false,openAfterAdd,warnings}={}){
 const status={},settings={},calls=[],batches=[];const context={setTimeout,clearTimeout,autoOpenSummary,problemFromUrl,dashboardFromUrl,readSamples,readDashboard,readStatement,document:{querySelector:q=>q==='#status'?status:settings},chrome:{scripting:{executeScript:async options=>options.func?.name==='readStatement'?[{result:'# F. Statement\n\nSample input 1\nOutput 2'}]:options.func?.name==='readDashboard'?[{result:['A','B1']}]:[{result:[{input:'1',output:'2'},{input:'3',output:'4'}]}]},tabs:{query:async()=>[{id:1,url:dashboard?'https://codeforces.com/contest/2278':'https://codeforces.com/contest/2278/problem/F'}]},storage:{local:{get:async()=>({directory,bridgeSecret:'paired',initialContent:'// popup template',openAfterAdd})}},runtime:{id:'a'.repeat(32),openOptionsPage:()=>{},sendMessage:async message=>{batches.push(message);return {files:message.problems.map(index=>({name:index+'.cpp',defaultProblem:'2278'+index,sampleCount:2}))};},sendNativeMessage:async(host,message)=>{calls.push({name:host,message});if(fail)throw Error('Specified native messaging host not found.');return {name,path:'C:/code/'+name,existed:true,defaultProblem:'2278F',warnings};}}},fetch:()=>assert.fail('新版 + 不应访问 HTTP 文件服务')};
 await vm.runInNewContext(fs.readFileSync(require.resolve('./extension/popup'),'utf8'),context);return {status,calls,batches};
}
test('浏览器 + 直接调用本机助手而无需 HTTP 服务',async()=>{
 const {status,calls}=await popup();assert.equal(calls.length,1);assert.equal(calls[0].name,'com.codeforces_helper.local');assert.equal(calls[0].message.action,'create');assert.equal(calls[0].message.initialContent,'// popup template');assert.equal(calls[0].message.samples.length,2);assert.match(calls[0].message.statement,/# F\. Statement/);assert.match(status.textContent,/已覆盖并写入初始内容/);assert.match(status.textContent,/默认提交题号：2278F/);
});
test('没有注册连接时显示当前扩展的一次性安装命令',async()=>{
 const {status}=await popup({fail:true});assert.ok(status.textContent.includes('submit --install-native '+'a'.repeat(32)));assert.doesNotMatch(status.textContent,/serve-files/);
});
test('没有配置目录时不启动助手',async()=>{const {status,calls}=await popup({directory:''});assert.equal(calls.length,0);assert.match(status.textContent,/设置保存目录/);});

test('分配 B.cpp 时浏览器反馈使用实际文件名',async()=>{const {status}=await popup({name:'B.cpp'});assert.match(status.textContent,/B\.cpp 已覆盖/);assert.doesNotMatch(status.textContent,/A\.cpp/);});

test('Dashboard 的 + 调用批量入口并显示每个文件映射',async()=>{
 const {status,calls,batches}=await popup({dashboard:true});assert.equal(calls.length,0);assert.equal(batches[0].action,'cfhelper-add-dashboard');assert.equal(batches[0].problems.join(','),'A,B1');assert.match(status.textContent,/A\.cpp → 2278A/);assert.match(status.textContent,/B1\.cpp → 2278B1/);
});

test('单题 + 保留独立开关的 false 值，打开失败时仍显示创建完成和原因',async()=>{
 const openAfterAdd={dashboardCpp:true,dashboardStatement:false,problemCpp:false,problemStatement:true};
 const {calls,status}=await popup({openAfterAdd,warnings:['文件已创建，自动打开失败：VS Code unavailable']});
 assert.deepEqual(calls[0].message.openAfterAdd,openAfterAdd);assert.match(status.textContent,/更新完成/);assert.match(status.textContent,/自动打开失败.*VS Code unavailable/);
});
