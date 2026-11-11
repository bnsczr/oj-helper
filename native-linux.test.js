const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const vm=require('node:vm');
const {buildFirefoxExtension}=require('./build-firefox');
const {detectExtensionIds,installLinuxNative,linuxBrowserDirectories,installFirefoxNative,firefoxId,hostName}=require('./native-install');
const {encode}=require('./native-host');
const {readPreferences}=require('./preferences');
const firstId='a'.repeat(32),secondId='b'.repeat(32);

async function fixture(run){
 const root=await fs.realpath(os.tmpdir()),directory=await fs.mkdtemp(path.join(root,"oj-linux's test-"));
 try{await run(directory);}finally{
  const target=await fs.realpath(directory);
  assert.equal(path.dirname(target),root);assert.ok(path.basename(target).startsWith("oj-linux's test-"));
  await fs.rm(target,{recursive:true,force:true});
 }
}

test('Linux 按浏览器用户配置和自定义数据目录识别扩展',()=>fixture(async home=>{
 const xdg=path.join(home,'xdg'),chrome=path.join(home,'chrome'),custom=path.join(home,'custom');
 const env={XDG_CONFIG_HOME:xdg,CHROME_CONFIG_HOME:chrome,CHROME_USER_DATA_DIR:custom};
 const roots=linuxBrowserDirectories({env,home});
 assert.ok(roots.includes(path.join(chrome,'chromium')));assert.ok(roots.includes(path.join(xdg,'microsoft-edge')));
 for(const [dir,id] of [[custom,firstId],[path.join(xdg,'microsoft-edge'),secondId]]){
  const profile=path.join(dir,'Default');await fs.mkdir(profile,{recursive:true});
  await fs.writeFile(path.join(profile,'Preferences'),JSON.stringify({extensions:{settings:{[id]:{manifest:{name:'oj-helper'}},['c'.repeat(32)]:{manifest:{name:'Other'}}}}}));
 }
 assert.deepEqual(detectExtensionIds(undefined,{platform:'linux',env,home}),[firstId,secondId]);
}));

test('Linux 用户级安装写入绝对启动路径并保留已注册的扩展 ID',()=>fixture(async directory=>{
 const chrome=path.join(directory,'google-chrome'),edge=path.join(directory,'microsoft-edge');
 await fs.mkdir(chrome);await fs.mkdir(edge);
 const options={projectDir:directory,directories:[chrome,edge]};
 assert.throws(()=>installLinuxNative(['not-an-extension-id'],options),/扩展 ID/);
 installLinuxNative([firstId],options);installLinuxNative([secondId],options);
 const launcher=path.join(directory,'.native-host','launcher.sh');
 for(const browser of [chrome,edge]){
  const config=JSON.parse(await fs.readFile(path.join(browser,'NativeMessagingHosts',hostName+'.json'),'utf8'));
  assert.equal(config.path,launcher);assert.equal(config.name,hostName);assert.equal(config.type,'stdio');
  assert.deepEqual(config.allowed_origins,[firstId,secondId].map(id=>'chrome-extension://'+id+'/'));
 }
 const script=await fs.readFile(launcher,'utf8');assert.ok(script.startsWith('#!/bin/sh\nexec '));assert.ok(script.endsWith(' "$@"\n'));
 if(process.platform!=='win32')assert.equal((await fs.stat(launcher)).mode&0o777,0o700);
}));

test('Firefox 构建加载共享后台，处理题目导入、即时提交和榜单',()=>fixture(async directory=>{
 const manifestFile=buildFirefoxExtension(path.join(directory,'extension'));
 const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
 assert.equal(manifest.browser_specific_settings.gecko.id,firefoxId);
 assert.equal(manifest.background.service_worker,undefined);
 assert.equal(manifest.options_ui.page,'options.html');
 assert.ok(manifest.host_permissions.includes('http://127.0.0.1/*'));
 for(const {js} of manifest.content_scripts){
  for(const file of js)await fs.access(path.join(path.dirname(manifestFile),file));
 }

 const token='a'.repeat(48),url='https://codeforces.com/contest/42/problem/A';
 const imports=[],tabs=[],results=[];
 let onMessage,onNativeMessage,pending;
 const firefox={
  storage:{local:{get:async()=>({bridgeSecret:'paired',directory})}},
  alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},
  runtime:{
   id:firefoxId,getURL:file=>'moz-extension://test/'+file,
   onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:fn=>{onMessage=fn;}},
   connectNative:name=>{
    assert.equal(name,hostName);
    return {onMessage:{addListener:fn=>{onNativeMessage=fn;}},onDisconnect:{addListener:()=>{}},postMessage:message=>assert.equal(message.action,'watch')};
   },
   sendNativeMessage:async(name,message)=>{
    assert.equal(name,hostName);imports.push(message);
    return message.action==='prepare-import'?{importId:'import'}:{name:'A.cpp'};
   }
  },
  tabs:{query:async()=>[],get:async id=>({id,url,status:'complete'}),create:async tab=>{tabs.push(tab);return {id:2};}},
  scripting:{executeScript:async ({func})=>[{result:func.name==='readStandingsPage'?{snapshot:{contest:'42'}}:{statement:'# A',samples:[]}}]}
 };
 const context=vm.createContext({browser:firefox,chrome:{},URL,AbortSignal,fetch:async (address,options)=>{
  const route=new URL(address).pathname;
  if(route==='/pending'){const task=pending;pending=undefined;return {ok:true,json:async()=>task||{}};}
  if(route==='/result')results.push(JSON.parse(options.body));
  return {ok:true};
 }});
 for(const file of manifest.background.scripts){
  vm.runInContext(await fs.readFile(path.join(path.dirname(manifestFile),file),'utf8'),context,{filename:file});
 }
 const imported=await new Promise(resolve=>{
  assert.equal(onMessage({action:'cfhelper-add-problem',tabId:1},{url:firefox.runtime.getURL('popup.html')},resolve),true);
 });
 assert.equal(imported.name,'A.cpp');assert.deepEqual(imports.map(message=>message.action),['prepare-import','create']);
 assert.equal(imports[1].statement,'# A');
 pending={key:'27121:'+token,oj:'qoj',contest:'42',problem:'123'};
 onNativeMessage({event:'bridge-ready'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(tabs[0].url,'https://qoj.ac/contest/42/submissions#qojhelper=27121:'+token);
 pending={key:'27121:'+token,oj:'cf',action:'open-standings',contest:'42',section:'contest'};
 await context.poll();
 assert.match(tabs[1].url,/\/standings\/friends\/true/);
 assert.deepEqual(results[0].standings,{contest:'42'});
}));

test('Firefox Linux 本机助手使用固定扩展 ID，启动器能接收消息并创建源码',async t=>{
 const shell=process.env.OJ_HELPER_TEST_SH;
 if(process.platform!=='linux'&&!shell)return t.skip('无 POSIX shell 测试环境');
 await fixture(async directory=>{
  const secretFile=path.join(directory,'secret'),stateFile=path.join(directory,'prefs.json');
  await fs.writeFile(secretFile,'paired');
  await fs.writeFile(path.join(directory,'native-host.js'),'require('+JSON.stringify(require.resolve('./native-host'))+').run('+JSON.stringify({secretFile,stateFile})+');');
  assert.deepEqual(installFirefoxNative({projectDir:directory,home:directory}),[firefoxId]);
  const registration=JSON.parse(await fs.readFile(path.join(directory,'.mozilla','native-messaging-hosts',hostName+'.json'),'utf8'));
  const {path:launcher}=registration;
  assert.equal(launcher,path.join(directory,'.native-host','launcher.sh'));
  assert.equal(registration.name,hostName);assert.equal(registration.type,'stdio');
  assert.deepEqual(registration.allowed_extensions,[firefoxId]);assert.equal(registration.allowed_origins,undefined);
  const message={action:'create',secret:'paired',directory,url:'https://codeforces.com/contest/42/problem/A',initialContent:'// Linux launcher test'};
  const args=['manifest.json',firefoxId];
  const result=spawnSync(shell||launcher,shell?[launcher,...args]:args,{input:encode(message),timeout:8000,windowsHide:true});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr.toString());
  assert.equal(result.stdout.readUInt32LE(),result.stdout.length-4);
  const response=JSON.parse(result.stdout.subarray(4).toString('utf8'));
  assert.equal(response.error,undefined);assert.equal(response.defaultProblem,'42A');
  assert.equal(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),message.initialContent);
  assert.equal(readPreferences(stateFile).activeOj,'cf');
 });
});
