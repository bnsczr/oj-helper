var ojBrowser=globalThis.browser??globalThis.chrome;
(async()=>{
const match=/^#cfhelper=(27121:[a-f0-9]{48})$/.exec(location.hash);
if(match){sessionStorage.setItem('cfhelper-key',match[1]);history.replaceState(null,'',location.pathname+location.search);}
const key=sessionStorage.getItem('cfhelper-key');if(!key)return;
const send=m=>ojBrowser.runtime.sendMessage({key,...m});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const banner=document.createElement('div');banner.style='position:fixed;top:0;left:0;z-index:2147483647;background:#fff3cd;color:#111;padding:12px;';document.documentElement.append(banner);
let confirmedId,submittedAt;
const say=async(message,extra={})=>{banner.textContent=message;const reply=await send({result:{message,...extra}});if(reply?.error)throw Error(reply.error);if(reply?.data?.cancelled)throw Error('提交已取消');return reply;};
const finish=async(message,ok,rawVerdict,measurements)=>{for(const k of ['cfhelper-key','cfhelper-pending','cfhelper-draft'])sessionStorage.removeItem(k);await say(message,{final:true,ok,submissionId:confirmedId,submittedAt,rawVerdict,measurements});};
let attentionShown=false;
async function attention(message){if(attentionShown)return;attentionShown=true;banner.textContent=message;await send({attention:true,result:{message}});}
function rows(){return [...document.querySelectorAll('tr[data-submission-id]')];}
function blocked(){return /just a moment|attention required|security verification/i.test(document.title)||!!document.querySelector('#challenge-running,#challenge-stage,input[name="handleOrEmail"]');}
const practiceStatus='/problemset/status?my=on';
const contestBase=job=>'/'+(job.section==='gym'?'gym':'contest')+'/'+job.contest;
const statusUrl=job=>job.route==='contest'?contestBase(job)+'/my':practiceStatus;
const myFilter=()=>new URLSearchParams(location.search).get('my')==='on';
const path=()=>location.pathname.replace(/\/$/,'');
const isPracticeStatus=()=>path()==='/problemset/status'&&myFilter();
function isStatus(job){
 if(job.route!=='contest')return isPracticeStatus();
 const base=contestBase(job);
 return path()===base+'/my'||(path()===base+'/status'&&myFilter());
}
function contestFinished(){
 const phase=document.querySelector('#sidebar .contest-state-phase')?.textContent.trim();
 const sidebar=document.querySelector('#sidebar')?.textContent||'';
 if(/contest is running|соревнование ид[её]т/i.test((phase||'')+'\n'+sidebar))return false;
 return /^(?:finished|заверш[её]н)$/i.test(phase||'')||/(?:^|\n)\s*(?:Finished|Заверш[её]н)\s*(?:\n|$)/i.test(sidebar)||/register for practice and you will be able to submit/i.test(sidebar);
}
function hasStatusList(job){
 if(document.querySelector('.status-frame-datatable')||rows().length)return true;
 // A fresh contest may have no submission table at all. The contest's
 // own navigation still identifies My Submissions when the list is empty.
 return job.route==='contest'&&!!document.querySelector(`.second-level-menu a[href="${contestBase(job)}/my"]`);
}
const save=(name,data)=>sessionStorage.setItem(name,JSON.stringify(data));
async function waitFor(predicate,deadline){while(Date.now()<deadline){if(blocked())await attention('网页需要登录或人机验证，请在浏览器完成。等待期间不会请求或刷新结果页。');else if(predicate())return true;await sleep(1000);}return false;}
function account(){const a=document.querySelector('#header a[href^="/profile/"]');return a?decodeURIComponent(a.getAttribute('href').split('/')[2]):null;}
function resultRow(row){return {id:Number(row.dataset.submissionId),links:[...row.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),language:row.cells?.[4]?.textContent.trim()||''};}
async function monitor(pending){
 confirmedId=pending.id;
 submittedAt=pending.postedAt;
 const contestMode=pending.verdictMode==='contest';
 async function finishChecker(){
  const scope=()=>document.querySelector('#facebox .content, #facebox, .submission-tests')||document;
  let comment;
  await waitFor(()=>{comment=readChecker(scope(),pending.resultSummary);return comment;},Math.min(pending.deadline,Date.now()+20000));
  await finish(pending.resultSummary+' | 最后测试点 checker：'+(comment||'无法得知结果（弹窗未提供对应测试点的 checker 信息）'),true);
 }
 if(pending.resultSummary&&!contestMode){
  await say(pending.resultSummary,{phase:'judged',submittedAt});
  await finishChecker();return;
 }
 await say('已点击提交，正在读取网页上的提交记录和实时评测结果。');
 let last='',lastChange=Date.now();
 while(Date.now()<pending.deadline){
  if(blocked()){await attention('读取结果页时需要登录或验证，请在浏览器完成；程序已暂停刷新。');await sleep(1000);continue;}
  // A failed POST can leave the submit form visible. Never click Submit again.
  const form=document.querySelector('select[name="programTypeId"]')?.closest('form');
  if(form){const errors=[...form.querySelectorAll('.error')].map(e=>e.textContent.trim()).filter(Boolean).join('；');if(errors){await finish('网站未接受提交：'+errors,false);return;}}
  if(!isStatus(pending)){
   if(form){await sleep(1000);if(Date.now()-lastChange<15000)continue;}
   location.assign(statusUrl(pending));return;
  }
  const candidates=rows().filter(row=>matchesSubmission(resultRow(row),pending));
  if(candidates.length>1&&!pending.id){await finish('发现多条同题新提交，无法唯一关联本次结果，请核对网站记录。',false);return;}
  const row=candidates[0];
  if(row){
   if(!pending.id){pending.id=Number(row.dataset.submissionId);confirmedId=pending.id;save('cfhelper-pending',pending);await say(`提交编号：${pending.id}（已核对账号、题号、编译器及新编号）。`,{submittedAt});}
   const verdict=readVerdict(row);
   if(pending.route==='contest'&&/^pretests? passed\b/i.test(verdict)){
    const detail='Pretests passed（通过预试，最终结果以系统测试为准）';
    const label=contestMode?contestReport(verdict).label:detail;
    await finish(`提交 ${pending.id}：${label}`,true,detail);return;
   }
   const judged=isFinalVerdict(verdict);
   if(verdict!==last){const first=!last;last=verdict;lastChange=Date.now();if(!judged){if(!contestMode)await say('评测：'+verdict);else if(first)await say('pending');}}
   if(judged){
    const time=row.querySelector('.time-consumed-cell')?.textContent.trim()||'';const memory=row.querySelector('.memory-consumed-cell')?.textContent.trim()||'';
    if(contestMode){await finish(`提交 ${pending.id}：${contestReport(verdict).label}`,true,verdict,{time,memory});return;}
    pending.resultSummary=`提交 ${pending.id}：${verdict}${time?' | '+time:''}${memory?' | '+memory:''}`;
    save('cfhelper-pending',pending);
    await say(pending.resultSummary,{phase:'judged',submittedAt});
    // Use Codeforces' own in-page popup handler, once. Never follow a plain
    // submission link: a full detail-page navigation can trigger verification.
    const link=row.querySelector('a.view-source')||row.querySelector('.status-verdict-cell .submissionVerdictWrapper')||row.querySelector('.status-verdict-cell [submissionid]')||row.querySelector('td.status-verdict-cell');
    if(!link||typeof link.click!=='function'){await finish(pending.resultSummary+' | 最后测试点 checker：无法得知结果（当前页面无详情弹窗入口）',true);return;}
    link.addEventListener?.('click',event=>event.preventDefault(),{once:true});
    link.click();
    await finishChecker();return;
   }
  }
  // Let Codeforces' own live updates run. Reload only after prolonged inactivity.
  if(Date.now()-lastChange>45000&&Date.now()-(pending.lastReload||0)>45000&&(pending.reloads||0)<6){pending.lastReload=Date.now();pending.reloads=(pending.reloads||0)+1;save('cfhelper-pending',pending);location.reload();return;}
  await sleep(1000);
 }
 await finish('等待评测超时，结果未知。请核对网站记录，避免重复提交。',false);
}
try{
 const pending=sessionStorage.getItem('cfhelper-pending');if(pending){await monitor(JSON.parse(pending));return;}
 let draft=JSON.parse(sessionStorage.getItem('cfhelper-draft')||'null');
 if(!draft){
  const deadline=Date.now()+540000;
  if(!await waitFor(account,deadline)){await finish('没有找到已登录的 Codeforces 账号，未提交。',false);return;}
  const reply=await send({});if(reply.error){banner.textContent=reply.error;return;}if(reply.data?.cancelled)throw Error('提交已取消');
  draft={...reply.data,handle:account(),deadline,phase:'baseline',route:'contest'};save('cfhelper-draft',draft);
  await say('通过正常网页记录提交前的编号，不使用后台抓取请求。');
 }
 if(draft.phase==='baseline'){
  if(blocked()&&!await waitFor(()=>!blocked(),draft.deadline)){await finish('验证等待超时，未提交。',false);return;}
  if(draft.section!=='gym'&&draft.route==='contest'&&(path()===contestBase(draft)||isStatus(draft))&&contestFinished()){
   draft.route='practice';draft.baselineRequested=false;save('cfhelper-draft',draft);
  }
  if(!isStatus(draft)){
   if(draft.baselineRequested)throw Error(draft.route==='contest'?'无法打开比赛的「My Submissions」，请确认已报名且比赛已开始':'无法打开题库的个人提交记录');
   draft.baselineRequested=true;save('cfhelper-draft',draft);location.assign(statusUrl(draft));return;
  }
  if(!await waitFor(()=>hasStatusList(draft),Math.min(draft.deadline,Date.now()+10000)))throw Error('无法读取提交前记录，请检查比赛页面是否可访问');
  if(account()?.toLowerCase()!==draft.handle.toLowerCase())throw Error('登录账号已变化');
  draft.baseline=Math.max(0,...rows().map(r=>Number(r.dataset.submissionId)));draft.phase='submit';save('cfhelper-draft',draft);
  location.assign(draft.route==='contest'?`${contestBase(draft)}/submit?problemIndex=${draft.problem}`:`/problemset/submit?contestId=${draft.contest}&problemIndex=${draft.problem}`);return;
 }
 if(blocked()&&!await waitFor(()=>!blocked(),draft.deadline))throw Error('验证等待超时，未提交');
 const expectedSubmit=draft.route==='contest'?contestBase(draft)+'/submit':'/problemset/submit';
 if(path()!==expectedSubmit||!document.querySelector('select[name="programTypeId"]'))throw Error(draft.route==='contest'?'未找到比赛提交表单，请确认当前账号已报名且比赛允许提交':'未找到题库提交表单');
 if(account()?.toLowerCase()!==draft.handle.toLowerCase())throw Error('登录账号已变化');
 const form=document.querySelector('select[name="programTypeId"]').closest('form');
 const problem=form.querySelector('[name="submittedProblemIndex"]');if(!problem)throw Error('找不到题号选项');problem.value=draft.problem;if(problem.value!==draft.problem)throw Error('题号不可选');
 const lang=form.querySelector('[name="programTypeId"]');const option=selectLanguage(lang.options,draft.language);if(!option)throw Error('编译器不可用，请用 --lang 指定网页中的名称');lang.value=option.value;lang.dispatchEvent(new Event('change',{bubbles:true}));
 const code=form.querySelector('textarea[name="source"]');if(!code)throw Error('找不到源码输入框');code.value=draft.source;code.dispatchEvent(new Event('input',{bubbles:true}));
 const toggle=form.querySelector('input[name="toggleEditorCheckbox"],#toggleEditorCheckbox');if(toggle?.checked)toggle.click();code.value=draft.source;
 const button=form.querySelector('input[type="submit"],button[type="submit"]');if(!button)throw Error('找不到提交按钮');
 const job={...draft,selectedLanguage:option.textContent.trim()};delete job.source;
 await say(`使用编译器：${job.selectedLanguage}。正在提交。`,{phase:'submitting'});
 job.postedAt=Date.now();save('cfhelper-pending',job);sessionStorage.removeItem('cfhelper-draft');button.click();
 await sleep(1000);if(document.contains(form))await monitor(job);
}catch(e){await finish('提交过程停止：'+e.message+'。请核对记录后再重试。',false);}
})();
