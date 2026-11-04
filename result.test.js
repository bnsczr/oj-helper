const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {isFinalVerdict,matchesSubmission,readVerdict,readChecker}=require('./extension/verdict');
const {selectLanguage}=require('./extension/languages');
const pending={contest:'2278',problem:'F',handle:'TheSunrise',baseline:100,selectedLanguage:'GNU G++23 14.2 (64 bit, msys2)',deadline:Date.now()+60000};
const record={id:101,links:['/profile/TheSunrise','/problemset/problem/2278/F'],language:'GNU C++23 (64)'};
test('编号链接含 submissionid 时仍读取评测单元格',()=>{
 const cell={textContent:' Wrong answer on test 2 ',querySelector:()=>null};
 const row={querySelector:q=>q==='td.status-verdict-cell'?cell:{textContent:'397223943'},cells:[]};
 assert.equal(readVerdict(row),'Wrong answer on test 2');
 cell.textContent='Running on test 4';assert.equal(readVerdict(row),'Running on test 4');
 cell.textContent='397223943';assert.equal(readVerdict(row),'等待评测');
 assert.equal(readVerdict({querySelector:()=>null,cells:[{},{},{},{},{},{textContent:'Accepted'}]}),'Accepted');
});
test('关联账号、新编号、题号和语言，兼容状态页编译器简称',()=>{
 assert.equal(matchesSubmission(record,pending),true);
 for(const row of [{...record,id:99},{...record,language:'GNU C++17'},{...record,links:['/profile/Other','/problemset/problem/2278/F']},{...record,links:['/profile/TheSunrise','/problemset/problem/2278/F1']}])assert.equal(matchesSubmission(row,pending),false);
 assert.equal(matchesSubmission({...record,id:101},{...pending,id:101}),true);
 assert.equal(matchesSubmission({...record,id:102},{...pending,id:101}),false);
});
test('从当前结果网页回传 Accepted，不抓取状态页或源码页',async()=>{
 const store=new Map([['cfhelper-key','27121:'+ 'a'.repeat(48)],['cfhelper-pending',JSON.stringify(pending)]]),events=[];
 const verdictCell={textContent:'Accepted',querySelector:()=>null};
 const row={dataset:{submissionId:'101'},cells:Array.from({length:8},()=>({textContent:''})),querySelectorAll:()=>record.links.map(h=>({getAttribute:()=>h})),querySelector:q=>q==='td.status-verdict-cell'?verdictCell:q.includes('submissionid')?{textContent:'101'}:q.includes('time-consumed')?{textContent:'62 ms'}:q.includes('memory-consumed')?{textContent:'100 KB'}:null};row.cells[4].textContent=record.language;row.cells[5]=verdictCell;
 const document={title:'Status - Codeforces',createElement:()=>({}),documentElement:{append:()=>{}},querySelector:()=>null,querySelectorAll:q=>q==='tr[data-submission-id]'?[row]:[]};
 const context={document,location:{hash:'',pathname:'/problemset/status',search:'?my=on',assign:()=>assert.fail("不应为 checker 导航"),reload:()=>assert.fail('不应刷新')},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},chrome:{runtime:{sendMessage:async m=>{events.push(m.result);return {data:{}};}}},URLSearchParams,Date,setTimeout,decodeURIComponent,isFinalVerdict,matchesSubmission,readVerdict,readChecker,fetch:()=>assert.fail('不应发起 fetch')};
 await vm.runInNewContext(fs.readFileSync(require.resolve('./extension/content'),'utf8'),context);
 assert.ok(events.some(e=>e?.message.includes('提交编号：101')));assert.match(events.at(-1).message,/Accepted.*62 ms.*100 KB.*checker：无法得知结果/);assert.equal(events.at(-1).final,true);
 // A challenge pauses the monitor; it must neither fetch nor navigate/reload.
 store.set('cfhelper-key','27121:'+'a'.repeat(48));store.set('cfhelper-pending',JSON.stringify(pending));events.length=0;document.title='Just a moment...';
 context.setTimeout=callback=>setImmediate(()=>{document.title='Status - Codeforces';callback();});
 await vm.runInNewContext(fs.readFileSync(require.resolve('./extension/content'),'utf8'),context);
 assert.ok(events.some(e=>e?.message.includes('程序已暂停刷新')));assert.match(events.at(-1).message,/Accepted.*checker：无法得知结果/);
});

test('读取 checker 标签、WA 指定测试点和 AC 单测试点',()=>{
 const make=(number,comment)=>({textContent:'Test: #'+number,parentElement:null,querySelector:q=>q.includes('test-header')?{textContent:'Test: #'+number}:null,querySelectorAll:()=>[{textContent:'Checker comment',nextElementSibling:{textContent:comment}}]});
 const root={querySelectorAll:()=>[make(1,'ok'),make(2,'wrong answer expected 3, found 4')]};
 assert.equal(readChecker(root,'Wrong answer on test 2'),'wrong answer expected 3, found 4');
 assert.equal(readChecker(root,'Wrong answer on test 3'),null);
 assert.equal(readChecker({querySelectorAll:()=>[make(1,'ok single test')]},'Accepted'),'ok single test');
});

test('截图所示 Judgement Protocol / Checker Log 无专用 class 时仍读取',()=>{
 const log="wrong answer 1st numbers differ - expected: '-3', found: '0'";
 const root={querySelectorAll:()=>[],innerText:'source code\nJudgement Protocol\nTest: #1, time: 15 ms., memory: 15656 KB, verdict: WRONG_ANSWER\nInput\n4\nOutput\n0\nAnswer\n-3\nChecker Log\nCopy\n'+log};
 assert.equal(readChecker(root,'Wrong answer on test 1'),log);
 assert.equal(readChecker(root,'Wrong answer on test 2'),null);
 assert.equal(readChecker(root,'Accepted'),log);
});

test('新任务先读取当前状态页基线，仅跳转一次表单且只点击一次提交',async()=>{
 const store=new Map(),events=[],navigation=[];let claims=0,clicks=0;
 const job={contest:'2278',problem:'F',language:'GNU G++23',source:'int main(){}'};
 const account={getAttribute:()=>'/profile/TheSunrise'};
 const row={dataset:{submissionId:'100'}};
 const document={title:'Codeforces',createElement:()=>({}),documentElement:{append:()=>{}},querySelector:query=>query.startsWith('#header')?account:query==='.status-frame-datatable'?{}:null,querySelectorAll:query=>query==='tr[data-submission-id]'?[row]:[]};
 const context={document,location:{hash:'#cfhelper=27121:'+'a'.repeat(48),pathname:'/problemset/status',search:'?my=on',assign:url=>navigation.push(url)},history:{replaceState:()=>{}},sessionStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},chrome:{runtime:{sendMessage:async message=>{if(message.result){events.push(message.result);return {data:{}};}claims++;return {data:job};}}},URLSearchParams,Date,setTimeout:callback=>setImmediate(callback),decodeURIComponent,Event,selectLanguage,isFinalVerdict,matchesSubmission,readVerdict,readChecker,fetch:()=>assert.fail('提交前不得后台抓取')};
 const script=fs.readFileSync(require.resolve('./extension/content'),'utf8');
 await vm.runInNewContext(script,context);
 assert.equal(claims,1);assert.deepEqual(navigation,['/problemset/submit?contestId=2278&problemIndex=F']);
 const draft=JSON.parse(store.get('cfhelper-draft'));assert.equal(draft.baseline,100);assert.equal(draft.phase,'submit');assert.equal(draft.handle,'TheSunrise');
 const language={options:[{textContent:'GNU G++23 14.2 (64 bit, msys2)',value:'91'}],dispatchEvent:()=>{}};
 const source={dispatchEvent:()=>{}},problem={};
 const button={click:()=>{
  clicks++;assert.equal(source.value,job.source);assert.equal(language.value,'91');assert.equal(problem.value,'F');
  const pending=JSON.parse(store.get('cfhelper-pending'));assert.equal(pending.baseline,100);assert.equal(pending.source,undefined);assert.equal(store.has('cfhelper-draft'),false);
 }};
 const form={querySelector:query=>query==='[name="submittedProblemIndex"]'?problem:query==='[name="programTypeId"]'?language:query==='textarea[name="source"]'?source:query==='input[type="submit"],button[type="submit"]'?button:null};
 context.location={hash:'',pathname:'/problemset/submit',search:'?contestId=2278&problemIndex=F',assign:()=>assert.fail('表单填写后不应再跳转前置页面')};
 document.querySelector=query=>query.startsWith('#header')?account:query==='select[name="programTypeId"]'?{closest:()=>form}:null;
 document.contains=()=>false;
 await vm.runInNewContext(script,context);assert.equal(claims,1);assert.equal(clicks,1);
 // Reuse the same saved baseline but reject a changed login before clicking.
 store.delete('cfhelper-pending');store.set('cfhelper-key','27121:'+'a'.repeat(48));store.set('cfhelper-draft',JSON.stringify(draft));account.getAttribute=()=>'/profile/Other';
 await vm.runInNewContext(script,context);assert.equal(clicks,1);assert.match(events.at(-1).message,/登录账号已变化/);assert.equal(events.at(-1).ok,false);
});
