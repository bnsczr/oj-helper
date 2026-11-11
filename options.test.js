const {normalizeOpenSettings}=require('./extension/open-settings');
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const {DEFAULT_INITIAL_CONTENT}=require('./extension/template');
async function options(initial={}){
 const state={...initial},elements={};const document={querySelector:selector=>elements[selector]||(elements[selector]={value:'',textContent:''})};
 const chrome={runtime:{id:'test-extension',sendMessage:()=>{}},storage:{local:{get:async key=>({[key]:state[key]}),set:async data=>Object.assign(state,data)}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./extension/options'),'utf8'),{document,chrome,DEFAULT_INITIAL_CONTENT,normalizeOpenSettings});await new Promise(resolve=>setImmediate(resolve));return {state,elements};
}
test('初始模板设置：缺省加载、保存自定义、恢复默认',async()=>{
 const {state,elements}=await options();assert.equal(elements['#initialContent'].value,DEFAULT_INITIAL_CONTENT);
 elements['#initialContent'].value='// user template\n';await elements['#saveInitialContent'].onclick();assert.equal(state.initialContent,'// user template\n');
 await elements['#resetInitialContent'].onclick();assert.equal(state.initialContent,DEFAULT_INITIAL_CONTENT);assert.equal(elements['#initialContent'].value,DEFAULT_INITIAL_CONTENT);
});
test('保存空模板及重新打开设置不会被默认模板替换',async()=>{
 const {state,elements}=await options({initialContent:''});assert.equal(elements['#initialContent'].value,'');await elements['#saveInitialContent'].onclick();assert.equal(state.initialContent,'');
});

test('比赛模式默认关闭自动打开，可与正常模式的四个开关独立保存',async()=>{
 const {state,elements}=await options();
 assert.equal(elements['#dashboardCpp'].checked,true);assert.equal(elements['#dashboardStatement'].checked,true);
 assert.equal(elements['#problemCpp'].checked,true);assert.equal(elements['#problemStatement'].checked,false);
 assert.equal(elements['#contestCpp'].checked,false);
 elements['#dashboardCpp'].checked=false;elements['#dashboardStatement'].checked=true;elements['#problemCpp'].checked=false;elements['#problemStatement'].checked=true;
 elements['#contestCpp'].checked=true;await elements['#saveOpenAfterAdd'].onclick();
 assert.deepEqual({...state.openAfterAdd},{dashboardCpp:false,dashboardStatement:true,problemCpp:false,problemStatement:true,contestCpp:true});
 const reopened=await options(state);assert.equal(reopened.elements['#dashboardCpp'].checked,false);assert.equal(reopened.elements['#problemCpp'].checked,false);assert.equal(reopened.elements['#problemStatement'].checked,true);
 assert.equal(reopened.elements['#initialContent'].value,DEFAULT_INITIAL_CONTENT);
 assert.equal(reopened.elements['#contestCpp'].checked,true);
});

test('Show unofficial 默认开启，可以独立关闭并持久化',async()=>{
 const {state,elements}=await options();assert.equal(elements['#standingsShowUnofficial'].checked,true);
 elements['#standingsShowUnofficial'].checked=false;await elements['#saveStandings'].onclick();assert.equal(state.standingsShowUnofficial,false);
 const reopened=await options(state);assert.equal(reopened.elements['#standingsShowUnofficial'].checked,false);
 assert.equal(reopened.elements['#dashboardCpp'].checked,true);assert.equal(reopened.elements['#problemStatement'].checked,false);
});
