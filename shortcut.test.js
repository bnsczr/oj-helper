const {autoOpenSummary}=require('./extension/open-settings');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');const {problemFromUrl,dashboardFromUrl}=require('./extension/problem');
function page(url='https://codeforces.com/contest/2278/problem/F'){
 let listener,resolve;const banners=[],calls=[];
 const context={setTimeout,clearTimeout,autoOpenSummary,window:{addEventListener:(name,fn)=>{listener=fn;},removeEventListener:()=>{}},location:{href:url},problemFromUrl,dashboardFromUrl,readDashboard:()=>['A','B1'],readStatement:()=>'# Problem statement',readSamples:()=>[{input:'1',output:'2'}],document:{addEventListener:(name,fn)=>{listener=fn;},createElement:()=>({setAttribute:()=>{},remove:()=>{}}),documentElement:{append:el=>banners.push(el)}},chrome:{runtime:{id:'test-extension',sendMessage:message=>{calls.push(message);return new Promise(r=>resolve=r);}}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/shortcut'),'utf8'),context);
 return {press:overrides=>listener({shiftKey:true,code:'KeyN',key:'N',preventDefault:()=>{},stopImmediatePropagation:()=>{},target:{closest:()=>null},...overrides}),banners,calls,finish:()=>resolve(dashboardFromUrl(url)?{files:[{name:'A.cpp',defaultProblem:'2278A',sampleCount:2},{name:'B1.cpp',defaultProblem:'2278B1',sampleCount:1}]}:{existed:true,path:'E:/code/A.cpp',defaultProblem:'2278F'})};
}
test('Shift+N 立即提示并单次添加，完成后显示结果',async()=>{
 const p=page();const running=p.press();assert.equal(p.banners[0].textContent,'正在添加…');assert.equal(p.calls.length,1);
 await p.press();await p.press({repeat:true});assert.equal(p.calls.length,1);p.finish();await running;
 assert.match(p.banners[0].textContent,/更新完成/);assert.match(p.banners[0].textContent,/默认提交题号：2278F/);
});
test('正文快捷键不影响输入框、代码编辑器和其他组合键',async()=>{
 const p=page();for(const overrides of [{shiftKey:false},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{code:'KeyM',key:'M'},{target:{closest:()=>({})}},{target:{isContentEditable:true}}])await p.press(overrides);
 assert.equal(p.calls.length,0);assert.equal(p.banners.length,0);
 await page('https://codeforces.com/').press();
});
test('后台快捷键入口只接受题目页，并使用浏览器提供的网址',async()=>{
 let onMessage;const calls=[];
 const chrome={storage:{local:{get:async()=>({bridgeSecret:'paired',directory:'E:/code',initialContent:'// configured template',openAfterAdd:{problemCpp:false,problemStatement:true}})}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},runtime:{id:'a'.repeat(32),onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},onMessage:{addListener:fn=>{onMessage=fn;}},sendNativeMessage:async(name,message)=>{calls.push(message);return {defaultProblem:'2278F'};}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/worker'),'utf8'),{chrome,URL,AbortSignal,fetch:async()=>({ok:false})});
 const message={action:'cfhelper-add-problem',samples:[{input:'1',output:'2'}],url:'https://evil.test/'};
 for(const sender of [{url:'https://evil.test/contest/1/problem/A',tab:{}},{url:'https://codeforces.com/',tab:{}},{url:'https://codeforces.com/contest/1/problem/A'}])assert.equal(onMessage(message,sender,()=>assert.fail('非法来源不应回复')),undefined);
 const data=await new Promise(resolve=>assert.equal(onMessage(message,{url:'https://codeforces.com/contest/2278/problem/F',tab:{id:1}},resolve),true));
 assert.equal(data.defaultProblem,'2278F');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://codeforces.com/contest/2278/problem/F');assert.equal(calls[0].initialContent,'// configured template');assert.equal(calls[0].samples.length,1);assert.equal(calls[0].openAfterAdd.problemCpp,false);assert.equal(calls[0].openAfterAdd.problemStatement,true);
});

test('更新和浏览器启动后补装已打开页；单个页注入失败不影响其他页',async()=>{
 const injected=[],handlers={};
 const chrome={storage:{local:{get:async()=>({})}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:fn=>handlers.start=fn},onInstalled:{addListener:fn=>handlers.install=fn},onMessage:{addListener:()=>{}}},tabs:{query:async()=>[{id:1},{id:2}]},scripting:{executeScript:async options=>{injected.push(options);if(options.target.tabId===1)throw Error('页面已关闭');}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/worker'),'utf8'),{chrome});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(injected.length,2);assert.equal(injected[1].files.join(','),'problem.js,samples.js,statement.js,open-settings.js,dashboard.js,shortcut.js');
 handlers.install();await new Promise(resolve=>setImmediate(resolve));assert.equal(injected.length,4);
 handlers.start();await new Promise(resolve=>setImmediate(resolve));assert.equal(injected.length,6);
});
test('重复补装先移除旧监听，使用 window 捕获阶段',()=>{
 const listeners=new Set();const window={addEventListener:(type,fn,capture)=>{assert.equal(capture,true);listeners.add(fn);},removeEventListener:(type,fn,capture)=>{assert.equal(capture,true);listeners.delete(fn);}};
 const context=vm.createContext({window});const script=fs.readFileSync(require.resolve('./extension/shortcut'),'utf8');
 vm.runInContext(script,context);vm.runInContext(script,context);assert.equal(listeners.size,1);
});

test('后台没有响应时显示超时并恢复快捷键，不无限停留正在添加',async()=>{
 let listener;const banners=[],calls=[];
 const context={setTimeout:callback=>{queueMicrotask(callback);return 1;},clearTimeout:()=>{},window:{addEventListener:(type,fn)=>listener=fn,removeEventListener:()=>{}},location:{href:'https://codeforces.com/contest/2278/problem/D'},problemFromUrl,dashboardFromUrl,readDashboard:()=>['A','B1'],readStatement:()=>'# Problem statement',readSamples:()=>[{input:'1',output:'2'}],document:{createElement:()=>({setAttribute:()=>{},remove:()=>{}}),documentElement:{append:element=>banners.push(element)}},chrome:{runtime:{id:'test-extension',sendMessage:message=>{calls.push(message);return new Promise(()=>{});}}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/shortcut'),'utf8'),context);
 const event={shiftKey:true,code:'KeyN',preventDefault:()=>{},stopImmediatePropagation:()=>{},target:{closest:()=>null}};
 await listener(event);assert.match(banners[0].textContent,/响应超时/);await listener(event);assert.equal(calls.length,2);
});

test('失效旧脚本先释放按键，不抢占新监听也不发送请求',async()=>{
 let listener,removed=false,prevented=false,stopped=false,sent=false;
 const context={window:{addEventListener:(type,fn)=>listener=fn,removeEventListener:()=>removed=true},location:{href:'https://codeforces.com/contest/2278/problem/D'},problemFromUrl,dashboardFromUrl,chrome:{runtime:{id:undefined,sendMessage:()=>sent=true}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/shortcut'),'utf8'),context);
 await listener({shiftKey:true,code:'KeyN',target:{closest:()=>null},preventDefault:()=>prevented=true,stopImmediatePropagation:()=>stopped=true});
 assert.equal(removed,true);assert.equal(prevented,false);assert.equal(stopped,false);assert.equal(sent,false);
});
test('旧版升级仅恢复安全的题目页，不刷新有输入的页面',async()=>{
 let installed;const reloaded=[];
 const chrome={storage:{local:{get:async()=>({})}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:()=>{}},onInstalled:{addListener:fn=>installed=fn},onMessage:{addListener:()=>{}}},tabs:{query:async()=>[{id:1},{id:2}],reload:async id=>reloaded.push(id)},scripting:{executeScript:async options=>options.func?[{result:options.target.tabId===1}]:[]}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/worker'),'utf8'),{chrome});
 installed({reason:'update',previousVersion:'1.5.0'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(reloaded,[1]);
 installed({reason:'update',previousVersion:'1.5.1'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(reloaded,[1]);
});

test('Dashboard 的 Shift+N 复用批量入口并显示全部映射',async()=>{
 const p=page('https://codeforces.com/contest/2278');const operation=p.press();assert.match(p.banners[0].textContent,/正在添加比赛全部题目/);assert.equal(p.calls[0].action,'cfhelper-add-dashboard');assert.equal(p.calls[0].problems.join(','),'A,B1');p.finish();await operation;assert.match(p.banners[0].textContent,/A\.cpp → 2278A/);assert.match(p.banners[0].textContent,/B1\.cpp → 2278B1/);
});
