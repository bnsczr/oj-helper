const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {main:mode}=require('./mode'),{selectOj,clearDefaults,readPreferences}=require('./preferences');
const {page,submission,card}=require('./test-support/qoj-fixtures');
const {contestVerdict}=require('./extension/verdict');
const source=file=>fs.readFileSync(require.resolve('./extension/'+file),'utf8');

test('比赛模式默认关闭，持久保存，与 OJ 切换和题号清空相互独立',async()=>{
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'oj-contest-mode-')),stateFile=path.join(directory,'preferences.json'),options={stateFile,log:()=>{}};
 try{
  assert.equal(await mode(['status'],options),'normal');assert.equal(fs.existsSync(stateFile),false);
  await mode(['contest'],options);await selectOj('qoj',stateFile);await clearDefaults(stateFile);
  assert.equal(await mode(['status'],options),'contest');assert.equal(readPreferences(stateFile).activeOj,'qoj');
  await assert.rejects(mode(['invalid'],options),/用法/);assert.equal(await mode(['status'],options),'contest');
  await mode(['normal'],options);assert.equal(await mode(['status'],options),'normal');
 }finally{await fsp.unlink(stateFile).catch(error=>{if(error.code!=='ENOENT')throw error;});await fsp.rmdir(directory);}
});

function monitorPage(html,url,site,pendingKey,job,advance){
 const events=[],store=new Map([[site+'-key','27121:'+'a'.repeat(48)],[pendingKey,JSON.stringify(job)]]);
 const p=page(html,url,{URLSearchParams,sessionStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},chrome:{runtime:{sendMessage:async message=>{events.push(message.result);return {data:{}};}}},setTimeout:callback=>setImmediate(()=>{advance(p.document);callback();})});
 p.run(source('verdict'));return {...p,events};
}

test('CF 比赛模式不会输出运行中的测试编号，也不打开 checker 弹窗',async()=>{
 const html='<table><tbody><tr data-submission-id="101"><td class="status-verdict-cell">Running on test 4</td><td class="time-consumed-cell">62 ms</td><td class="memory-consumed-cell">100 KB</td><td><a class="view-source">checker</a></td></tr></tbody></table>';
 const p=monitorPage(html,'https://codeforces.com/problemset/status?my=on','cfhelper','cfhelper-pending',{id:101,verdictMode:'contest',deadline:Date.now()+5000},document=>{document.querySelector('.status-verdict-cell').textContent='Wrong answer on test 9';});
 p.document.querySelector('.view-source').click=()=>assert.fail('比赛模式不应打开 checker 弹窗');p.context.readChecker=()=>assert.fail('比赛模式不应读取 checker');
 await p.run(source('content'));assert.ok(p.events.some(event=>event.message==='pending'));assert.equal(p.events.at(-1).message,'提交 101：wrong-answer');assert.equal(p.events.at(-1).final,true);
 assert.doesNotMatch(p.events.map(event=>event.message).join('\n'),/test \d|checker|62 ms|100 KB/i);
});

test('QOJ 比赛模式保留账号、题目和语言核对，跳过普通 Test 和 Extra Test 详情',async()=>{
 const p=monitorPage(submission(101,'Running on test 4')+'<div id="details_details_accordion">'+card(9,'private-checker')+card(1,'private-extra',true)+'</div>','https://qoj.ac/submission/101','ojhelper-qoj','ojhelper-qoj-pending',{id:101,baseline:100,handle:'TestUser',contest:'42',problem:'123',selectedLanguage:'C++23',verdictMode:'contest',deadline:Date.now()+5000},document=>{document.querySelector('.uoj-score').textContent='TLE on test 9';});
 const query=p.document.querySelectorAll.bind(p.document);p.document.querySelectorAll=selector=>{assert.doesNotMatch(selector,/details_details_accordion/);return query(selector);};
 await p.run(source('qoj-content'));assert.ok(p.events.some(event=>event.message==='pending'));assert.equal(p.events.at(-1).message,'提交 QOJ #101：timelimit');assert.equal(p.events.at(-1).final,true);
 assert.doesNotMatch(p.events.map(event=>event.message).join('\n'),/test \d|checker|private|12ms|4096kb/i);
});

test('CF 和 QOJ 的缩写及完整评测名称映射到相同的比赛标签',()=>{
 for(const [expected,...variants] of [
  ['correct','AC ✓','Accepted on test 1'],['wrong-answer','WA on test 9','Wrong answer on test 9'],
  ['timelimit','TLE','Time limit exceeded on pretest 4'],['run-error','RE','Runtime error on pretest 2'],
  ['compiler-error','CE','Compilation error'],['memory-limit','MLE','Memory limit exceeded on test 2'],
  ['output-limit','OLE','Output limit exceeded'],['internal-error','JF','Judgment failed'],['75 / 100','75 / 100']
 ])for(const value of variants)assert.equal(contestVerdict(value),expected,value);
 assert.equal(contestVerdict('Unrecognized verdict with details',75),'score: 75');
 assert.equal(contestVerdict('Unrecognized verdict with details'),'unknown-result');
});
