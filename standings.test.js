const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {readStandingsPage}=require('./extension/standings');const {renderStandings}=require('./standings-report');
const url='https://codeforces.com/contest/2278/standings/friends/true';
function cell(innerText,nodeName='TD',extra={}){return {innerText,nodeName,rowSpan:1,colSpan:1,...extra};}
function fixture({toggle=true,handle='TheSunrise',rows}={}){
 const headers=['#','Who','=','Penalty','*','A','B','C','D','E','F','G','Π','Δ\nFinal','⬆'];
 const data=rows||[
  ['1 (224)','*Cy rillya','6','237','','+\n00:03','+\n00:09','+1\n00:19','+\n00:30','+\n00:41','+3\n01:35','','N/A','N/A','N/A'],
  ['2 (1679)','zoededoge','5','255','','+\n00:28','+\n00:32','+1\n00:41','+\n00:48','+1\n01:26','','','1529','+71','N/C'],
  ['','* TheSunrise','6','','','+','+','+','+','+3','+','','N/A','N/A','N/A'],
  ['','* zoededoge','2','','','','','','','','+','+3','N/A','N/A','N/A'],
  ['','Accepted\nTried','','','','17196\n18936','14173\n14587','12024\n12348','8284\n8530','5025\n6325','1266\n1315','603\n764','','','']
 ];
 const table={rows:[{cells:headers.map(text=>cell(text,'TH'))},...data.map(values=>({cells:values.map(text=>cell(text))}))]};
 const context={URL,Date,location:{pathname:'/contest/2278/standings/friends/true',href:url,origin:'https://codeforces.com'},document:{title:'Friends standings',querySelector:selector=>selector.startsWith('table.standings')?table:selector.startsWith('input[name="showUnofficial"]')?{checked:toggle}:selector.startsWith('#header')?(handle?{getAttribute:()=>'/profile/'+handle}:null):selector.startsWith('#pageContent .contest-name')?{textContent:'Codeforces Round 1131 (Div. 3)'}:selector.startsWith('.standings-status')?{textContent:'Final standings, open hacking phase finished'}:null,querySelectorAll:()=>[]}};
 const read=vm.runInNewContext('('+readStandingsPage.toString()+')',context);
 return {table,context,read:settings=>read({section:'contest',contest:'2278',showUnofficial:true,...settings})};
}
test('好友榜单完整读取全部行列，结束后仍保留排名、罚时、单题时间和评级变化',()=>{
 const {snapshot}=fixture().read();assert.equal(snapshot.kind,'friends-standings');assert.equal(snapshot.headers.length,15);assert.equal(snapshot.rows.length,5);
 assert.equal(snapshot.rows[0][0],'1 (224)');assert.equal(snapshot.rows[0][3],'237');assert.equal(snapshot.rows[0][7],'+1\n00:19');assert.equal(snapshot.rows[1][13],'+71');
 assert.equal(snapshot.rows[2][1],'* TheSunrise');assert.equal(snapshot.rows[2][0],'');assert.equal(snapshot.rows[2][3],'');
 assert.equal(snapshot.rows[3][1],'* zoededoge');assert.equal(snapshot.rows[4][1],'Accepted\nTried');assert.equal(snapshot.rows[4][5],'17196\n18936');
 const markdown=renderStandings(snapshot);assert.match(markdown,/Final standings/);assert.match(markdown,/1 \(224\)/);assert.match(markdown,/\+1<br>00:19/);assert.match(markdown,/Accepted<br>Tried/);assert.match(markdown,/Δ<br>Final/);assert.match(markdown,/1529.*\+71/);
});
test('不再按本人过滤，即使登录账号不在表中也完整导出好友表格',()=>{
 const {snapshot}=fixture({handle:'NotInRanklist'}).read();assert.equal(snapshot.rows.length,5);assert.equal(snapshot.handle,'NotInRanklist');
 const anonymous=fixture({handle:null}).read().snapshot;assert.equal(anonymous.rows.length,5);assert.equal(anonymous.handle,null);
});
test('合并表头和统计行保持列对齐，不将底部 th 当作新的表头',()=>{
 const f=fixture();f.table.rows=[
  {cells:[cell('Who','TH',{rowSpan:2}),cell('Problems','TH',{colSpan:2})]},
  {cells:[cell('A','TH'),cell('B','TH')]},
  {cells:[cell('User'),cell('+'),cell('-1')]},
  {cells:[cell('Accepted / Tried','TH'),cell('100 / 200'),cell('50 / 70')]}
 ];
 const {snapshot}=f.read();assert.equal(snapshot.headers.join(','),'Who,Problems\nA,B');assert.equal(snapshot.rows[0].join(','),'User,+,-1');assert.equal(snapshot.rows[1][0],'Accepted / Tried');
});
test('只从匹配比赛的 Friends standings 读取，验证和加载中不会产出假表格',()=>{
 const f=fixture();f.context.location.pathname='/contest/2278/standings';assert.equal(f.read().waiting,true);
 f.context.location.pathname='/contest/1/standings/friends/true';assert.equal(f.read().waiting,true);
 f.context.location.pathname='/contest/2278/standings/friends/true';f.context.document.title='Just a moment...';assert.equal(f.read().challenge,true);
 assert.equal(fixture({toggle:false}).read().toggle,true);assert.equal(fixture({toggle:false}).read({showUnofficial:false}).snapshot.rows.length,5);
});
test('open b 只新开好友榜单，遵循非正式设置，不搜索账号或关闭标签页',async()=>{
 for(const showUnofficial of [true,false]){
  const created=[],scripts=[];const snapshot=fixture().read().snapshot;
  const chrome={storage:{local:{get:async()=>({standingsShowUnofficial:showUnofficial})}},tabs:{create:async options=>{created.push(options);return {id:5};},get:async()=>({status:'complete'}),remove:()=>assert.fail('好友榜单应保留打开')},scripting:{executeScript:async options=>{scripts.push(options.func.name);return [{result:{snapshot:{...snapshot,showUnofficial}}}];}}};
  const context=vm.createContext({chrome,setTimeout:callback=>callback()});vm.runInContext(fs.readFileSync(require.resolve('./extension/standings'),'utf8'),context);
  const result=await context.openStandingsTab({contest:'2278',section:'contest'});
  assert.equal(created.length,1);assert.equal(created[0].active,true);assert.equal(created[0].url,url+'?showUnofficial='+showUnofficial);assert.equal(result.rows.length,5);assert.deepEqual(scripts,['readStandingsPage']);
 }
});
