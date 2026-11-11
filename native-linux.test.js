const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {detectExtensionIds,installLinuxNative,linuxBrowserDirectories,hostName}=require('./native-install');
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

test('POSIX 启动器能在带空格和单引号的项目路径接收浏览器消息并创建源码',async t=>{
 const shell=process.env.OJ_HELPER_TEST_SH;
 if(process.platform!=='linux'&&!shell)return t.skip('无 POSIX shell 测试环境');
 await fixture(async directory=>{
  const secretFile=path.join(directory,'secret'),stateFile=path.join(directory,'prefs.json');
  await fs.writeFile(secretFile,'paired');
  await fs.writeFile(path.join(directory,'native-host.js'),'require('+JSON.stringify(require.resolve('./native-host'))+').run('+JSON.stringify({secretFile,stateFile})+');');
  const browser=path.join(directory,'chromium');
  installLinuxNative([firstId],{projectDir:directory,directories:[browser]});
  const {path:launcher}=JSON.parse(await fs.readFile(path.join(browser,'NativeMessagingHosts',hostName+'.json'),'utf8'));
  const message={action:'create',secret:'paired',directory,url:'https://codeforces.com/contest/42/problem/A',initialContent:'// Linux launcher test'};
  const result=spawnSync(shell||launcher,shell?[launcher]:[],{input:encode(message),timeout:8000,windowsHide:true});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr.toString());
  assert.equal(result.stdout.readUInt32LE(),result.stdout.length-4);
  const response=JSON.parse(result.stdout.subarray(4).toString('utf8'));
  assert.equal(response.error,undefined);assert.equal(response.defaultProblem,'42A');
  assert.equal(await fs.readFile(path.join(directory,'A.cpp'),'utf8'),message.initialContent);
  assert.equal(readPreferences(stateFile).activeOj,'cf');
 });
});
