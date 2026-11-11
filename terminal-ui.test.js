const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSubmissionView,showSubmissionStatus}=require('./terminal-ui');

function capture(spec,{isTTY=false,columns=120,env={}}={}){
 const lines=[],errors=[];
 const view=createSubmissionView(spec,{
  output:{isTTY,columns,write:value=>lines.push(value)},
  error:{write:value=>errors.push(value)},
  env
 });
 return {view,lines,errors};
}

test('正常模式兼容旧版 CF 和 QOJ 事件，保留运行信息及多行 checker',()=>{
 const cf=capture({contest:'2278',problem:'F',language:'GNU G++23'});
 cf.view.event({message:'使用编译器：GNU G++23 14.2。正在提交。'});
 cf.view.event({message:'提交 101：Wrong answer on test 9 | 62 ms | 100 KB | 最后测试点 checker：expected A | B\nfound C',final:true,ok:true});
 assert.match(cf.lines.join(''),/Run ID #101.*题号 2278F.*结果 Wrong answer on test 9.*内存 100 KB.*时间 62 ms.*语言 GNU G\+\+23 14\.2/);
 assert.equal(cf.lines.at(-1),'最后测试点 checker  expected A | B\n  found C\n');
 assert.doesNotMatch(cf.lines.join(''),/\x1b|\r/);

 const qoj=capture({oj:'qoj',problem:'123',language:'C++23'});
 qoj.view.event({message:'使用 QOJ 编译器：C++ 23。正在提交。'});
 qoj.view.event({message:'提交 QOJ #102：WA | 分数：75 / 100 | 12ms | 4096kb | 最后普通测试点 Test #25 checker：无法得知结果',final:true,ok:true});
 assert.match(qoj.lines.join(''),/Run ID #102.*题号 QOJ #123.*结果 WA.*内存 4096kb.*时间 12ms.*语言 C\+\+ 23.*分数 75 \/ 100/);
 assert.equal(qoj.lines.at(-1),'最后普通测试点 Test #25 checker  无法得知结果\n');
});

test('比赛模式在终端覆盖评测进度且不显示测试详情',()=>{
 const {view,lines,errors}=capture({contest:'2278',problem:'F',language:'GNU G++23',verdictMode:'contest'},{isTTY:true,env:{NO_COLOR:''}});
 view.status('等待浏览器领取');
 view.event({message:'提交编号：101（已核对账号、题号、编译器及新编号）。'});
 view.event({message:'评测：Running on test 9'});
 view.event({message:'提交 101：Wrong answer on test 9 | 62 ms | 100 KB | 最后测试点 checker：expected A',final:true,ok:true});
 assert.equal(lines.filter(line=>line.includes('pending')).length,1);
 assert.ok(lines.includes('\r\x1b[2K'));
 assert.match(lines.at(-1),/Run ID #101.*结果 WRONG-ANSWER/);
 assert.doesNotMatch(lines.join(''),/test 9|62 ms|100 KB|checker|\x1b\[\d+m/);
 view.event({message:'等待评测超时，结果未知。',final:true,ok:false});
 assert.match(errors.join(''),/错误  等待评测超时/);
});
test('比赛结果按规则着色，QOJ 的复合结果整条为黄色',()=>{
 for(const [oj,verdict,label,color] of [
  ['cf','Accepted','CORRECT',32],['cf','TLE','TIME-LIMIT',31],['cf','RE','RUN-ERROR',31],
  ['cf','Wrong answer on test 9','WRONG-ANSWER',31],['qoj','WA','WRONG-ANSWER',31],
  ['cf','MLE','MEMORY-LIMIT',31],['cf','ILE','IDLENESS-LIMIT',31],['cf','CE','UNKNOW-ERROR',33],
  ['cf','Pretests passed','UNKNOW-ERROR',33],['qoj','TL','TIME-LIMIT',31],['qoj','AC，TL','CORRECT, TIME-LIMIT',33],
  ['qoj','CORRECT, TIME-LIMIT','CORRECT, TIME-LIMIT',33],['qoj','AC, WA','CORRECT, WRONG-ANSWER',33]
 ]){
  const {view,lines}=capture({oj,contest:'42',problem:'1',language:'C++',verdictMode:'contest'},{isTTY:true});
  view.event({message:'提交 '+(oj==='qoj'?'QOJ #':'')+'101：'+verdict,final:true,ok:true});
  assert.ok(lines.at(-1).includes('\x1b['+color+'m'+label+'\x1b[0m'),verdict);
 }
});

test('pending 前的点会改变，收到结果后停止动画，重定向时输出纯文本',async()=>{
 const wait=()=>new Promise(resolve=>setTimeout(resolve,260));
 const spec={contest:'2278',problem:'F',language:'GNU G++23',verdictMode:'contest'};
 const tty=capture(spec,{isTTY:true});
 tty.view.event({message:'提交编号：101'});
 await wait();
 assert.equal(tty.lines.filter(line=>line.includes('pending')).length,1);
 assert.equal(tty.lines.filter(line=>line.includes('\x1b[2K')).length,0);
 assert.ok(tty.lines.some(line=>/^\x1b\[9D.*\x1b\[8C$/.test(line)));
 tty.view.event({message:'提交 101：CORRECT',final:true,ok:true});
 const length=tty.lines.length;
 const redirected=capture(spec);
 redirected.view.event({message:'提交编号：101'});
 await wait();
 assert.equal(tty.lines.length,length);
 assert.deepEqual(redirected.lines,['评测  #101  pending\n']);
});

test('填写表单和点击按钮后等待确认，核对提交编号后才开始 pending',()=>{
 for(const oj of ['cf','qoj']){
  const {view,lines}=capture({oj,contest:'42',problem:'A',language:'C++23',verdictMode:'contest'});
  view.status('等待浏览器领取');
  view.event({message:oj==='qoj'?'使用 QOJ 编译器：C++23。正在提交。':'使用编译器：GNU G++23。正在提交。'});
  view.event({message:'已点击提交，正在读取网页上的提交记录和实时评测结果。'});
  view.event({message:'pending'});
  view.event({message:'评测：Running on test 1'});
  assert.doesNotMatch(lines.join(''),/pending/);
  assert.match(lines.join(''),/正在提交/);assert.match(lines.join(''),/等待提交确认/);
  view.event({message:oj==='qoj'?'QOJ 提交编号：102':'提交编号：102'});
  assert.match(lines.at(-1),/#102  pending/);
 }
});
test('比赛状态栏中通过为绿、尝试未通过为红、零次尝试无色',()=>{
 const lines=[];
 showSubmissionStatus({
  site:{id:'cf',name:'Codeforces'},contest:true,history:[],
  board:{section:'gym',contest:'106725',problems:[
   {index:'A',tries:2,solved:true},{index:'B',tries:1,solved:false},{index:'C',tries:0,solved:false}
  ]}
 },{output:{isTTY:true,columns:100,write:line=>lines.push(line)},env:{}});
 assert.match(lines[0],/\x1b\[97;41m +A +\x1b\[0m│\x1b\[30;102m +B +\x1b\[0m│\x1b\[97;44m +C +\x1b\[0m/);
 assert.match(lines[0],/│\x1b\[30;102m +2 tries +\x1b\[0m│\x1b\[97;41m +1 try +\x1b\[0m│ +│/);
});

test('等待结果的题目蓝色 pending，提交记录灰色 pending 或 UNKNOW，已通过的题目保持绿色',()=>{
 const lines=[];
 showSubmissionStatus({
  site:{id:'qoj',name:'QOJ'},contest:true,
  board:{contest:'42',problems:[
   {index:'A',tries:1,solved:false,pending:true,headerColor:'30;48;2;240;190;190'},
   {index:'B',tries:2,solved:true,pending:true,headerColor:'30;48;2;190;240;190'}
  ]},
  history:[{id:'103',state:'pending',verdict:'pending'},{id:'102',state:'unknown',verdict:'UNKNOW'},{id:'101',verdict:'CORRECT'}]
 },{output:{isTTY:true,columns:100,write:line=>lines.push(line)},env:{}});
 const output=lines.join('');
 assert.match(output,/\x1b\[30;48;2;240;190;190m +A +\x1b\[0m/);
 assert.match(output,/\x1b\[97;44m +pending 1 try +\x1b\[0m/);
 assert.match(output,/\x1b\[30;102m +2 tries +\x1b\[0m/);
 assert.match(output,/#103.*\x1b\[90mpending\x1b\[0m/);
 assert.match(output,/#102.*\x1b\[90mUNKNOW\x1b\[0m/);
 assert.match(output,/#101.*\x1b\[32mCORRECT\x1b\[0m/);
});

test('普通模式保留评测原文和颜色，不换行空格不会挤偏耗时列',()=>{
 let output='';
 showSubmissionStatus({site:{id:'cf',name:'Codeforces'},contest:false,history:[
  {id:'102',verdict:'Accepted',time:'140\u00a0ms',memory:'47000 KB'},
  {id:'101',verdict:'Wrong answer on test 2',time:'781 ms',memory:'31300 KB'}
 ]},{output:{isTTY:true,columns:120,write:value=>{output+=value;}},env:{}});
 assert.match(output,/#102.*\x1b\[32mAccepted\x1b\[0m.*140 ms/);
 assert.match(output,/#101.*\x1b\[31mWrong answer on test 2\x1b\[0m.*781 ms/);
 const rows=output.replace(/\x1b\[\d+m/g,'').split('\n').filter(line=>line.startsWith('#'));
 const separators=row=>Array.from(row.matchAll(/\|/g),match=>match.index);
 assert.deepEqual(separators(rows[0]),separators(rows[1]));
});

test('先输出评测结论，checker 返回后只补充详情',()=>{
 const {view,lines}=capture({contest:'42',problem:'A',language:'GNU G++23'});
 const message='提交 102：Accepted | 31 ms | 0 KB';
 view.event({message,phase:'judged'});
 assert.match(lines.join(''),/Run ID #102.*Accepted[\s\S]*正在读取 checker/);
 view.event({message:message+' | 最后测试点 checker：ok',final:true,ok:true});
 assert.equal(lines.filter(line=>line.includes('Run ID #102')).length,1);
 assert.equal(lines.at(-1),'最后测试点 checker  ok\n');
});

test('快捷键计时的逐题栏显示过题时间与总罚时，历史按所属场次显示相对或绝对时间',()=>{
 const startedAt=Date.parse('2026-11-11T09:00:00+08:00');
 const data={site:{id:'cf',name:'Codeforces'},contest:false,board:{id:'timed',contest:'42',startedAt,problems:[
  {index:'A',tries:2,solved:true,solvedMinutes:23,penaltyMinutes:43},
  {index:'B',tries:1,solved:true,solvedMinutes:38,penaltyMinutes:38},
  {index:'C',tries:2,solved:false}
 ]},history:[
  {id:'102',boardId:'timed',submittedAt:startedAt+23*60000+7000,problem:'42A',verdict:'Accepted'},
  {id:'101',boardId:'prior',submittedAt:startedAt-60000,problem:'41A',verdict:'Accepted'},
  {id:'100',problem:'41A',verdict:'Accepted'}
 ]};
 let output='';const terminal={output:{write:value=>{output+=value;}}};
 showSubmissionStatus(data,terminal);
 assert.match(output,/│ +罚时 +│ +A +│/);
 assert.match(output,/│ +81 +│ +23 +│ +38 +│ +│/);
 assert.match(output,/提交编号 +\| +提交时间 +\| +题号 +\| +文件 +\| +评测结果 +\| +耗时 +\| +内存/);
 assert.match(output,/#102.*\+00:23:07.*42A/);
 assert.match(output,/#101.*2026-11-11 08:59.*41A/);
 assert.match(output,/#100.*时间未知/);
 output='';showSubmissionStatus({...data,board:undefined},terminal);
 assert.match(output,/#102.*2026-11-11 09:23.*42A/);
});
