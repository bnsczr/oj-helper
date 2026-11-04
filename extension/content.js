(async()=>{
const match=/^#cfhelper=(27121:[a-f0-9]{48})$/.exec(location.hash);
if(match){sessionStorage.setItem('cfhelper-key',match[1]);history.replaceState(null,'',location.pathname+location.search);}
const key=sessionStorage.getItem('cfhelper-key');if(!key)return;
const send=m=>chrome.runtime.sendMessage({key,...m});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const banner=document.createElement('div');banner.style='position:fixed;top:0;left:0;z-index:2147483647;background:#fff3cd;color:#111;padding:12px;';document.documentElement.append(banner);
const say=async(message,extra={})=>{banner.textContent=message;return send({result:{message,...extra}});};
const finish=async(message,ok)=>{for(const k of ['cfhelper-key','cfhelper-pending','cfhelper-draft'])sessionStorage.removeItem(k);await say(message,{final:true,ok});};
let attentionShown=false;
async function attention(message){if(attentionShown)return;attentionShown=true;banner.textContent=message;await send({attention:true,result:{message}});}
function rows(){return [...document.querySelectorAll('tr[data-submission-id]')];}
function blocked(){return /just a moment|attention required|security verification/i.test(document.title)||!!document.querySelector('#challenge-running,#challenge-stage,input[name="handleOrEmail"]');}
const statusUrl='/problemset/status?my=on';
const isStatus=()=>location.pathname==='/problemset/status'&&new URLSearchParams(location.search).get('my')==='on';
const save=(name,data)=>sessionStorage.setItem(name,JSON.stringify(data));
async function waitFor(predicate,deadline){while(Date.now()<deadline){if(blocked())await attention('网页需要登录或人机验证，请在浏览器完成。等待期间不会请求或刷新结果页。');else if(predicate())return true;await sleep(1000);}return false;}
function account(){const a=document.querySelector('#header a[href^="/profile/"]');return a?decodeURIComponent(a.getAttribute('href').split('/')[2]):null;}
function resultRow(row){return {id:Number(row.dataset.submissionId),links:[...row.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),language:row.cells?.[4]?.textContent.trim()||''};}
async function monitor(pending){
 await say('已点击提交，正在读取网页上的提交记录和实时评测结果。');
async function finishChecker(){
  if(blocked()&&!await waitFor(()=>!blocked(),pending.deadline)){await finish(pending.resultSummary+' | 最后测试点 checker：无法得知结果',true);return;}
  const scope=()=>document.querySelector('#facebox .content, #facebox, .submission-tests')||document;
  const ready=await waitFor(()=>readChecker(scope(),pending.resultSummary),Math.min(pending.deadline,Date.now()+20000));
  const comment=ready?readChecker(scope(),pending.resultSummary):null;
  await finish(pending.resultSummary+' | 最后测试点 checker：'+(comment||'无法得知结果（弹窗未提供对应测试点的 checker 信息）'),true);return;
 }
 if(pending.resultSummary){await finishChecker();return;}
 let last='',lastChange=Date.now();
 while(Date.now()<pending.deadline){
  if(blocked()){await attention('读取结果页时需要登录或验证，请在浏览器完成；程序已暂停刷新。');await sleep(1000);continue;}
  // A failed POST can leave the submit form visible. Never click Submit again.
  const form=document.querySelector('select[name="programTypeId"]')?.closest('form');
  if(form){const errors=[...form.querySelectorAll('.error')].map(e=>e.textContent.trim()).filter(Boolean).join('；');if(errors){await finish('网站未接受提交：'+errors,false);return;}}
  if(!isStatus()){
   if(form){await sleep(1000);if(Date.now()-lastChange<15000)continue;}
   location.assign(statusUrl);return;
  }
  const candidates=rows().filter(row=>matchesSubmission(resultRow(row),pending));
  if(candidates.length>1&&!pending.id){await finish('发现多条同题新提交，无法唯一关联本次结果，请核对网站记录。',false);return;}
  const row=candidates[0];
  if(row){
   if(!pending.id){pending.id=Number(row.dataset.submissionId);save('cfhelper-pending',pending);await say(`提交编号：${pending.id}（已核对账号、题号、编译器及新编号）。`);}
   const verdict=readVerdict(row);
   if(verdict!==last){last=verdict;lastChange=Date.now();await say('评测：'+verdict);}
   if(isFinalVerdict(verdict)){
    const time=row.querySelector('.time-consumed-cell')?.textContent.trim()||'';const memory=row.querySelector('.memory-consumed-cell')?.textContent.trim()||'';
    pending.resultSummary=`提交 ${pending.id}：${verdict}${time?' | '+time:''}${memory?' | '+memory:''}`;
    save('cfhelper-pending',pending);
    // Use Codeforces' own in-page popup handler, once. Never follow a plain
    // submission link: a full detail-page navigation can trigger verification.
    const link=row.querySelector('a.view-source')||row.querySelector('.status-verdict-cell .submissionVerdictWrapper')||row.querySelector('.status-verdict-cell [submissionid]')||row.querySelector('td.status-verdict-cell');
    if(!link||typeof link.click!=='function'){await finish(pending.resultSummary+' | 最后测试点 checker：无法得知结果（当前页面无详情弹窗入口）',true);return;}
    await say('评测已结束，正在通过当前页面的详情弹窗读取 checker。');
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
  if(!await waitFor(()=>account()&&(isStatus()?(document.querySelector('.status-frame-datatable')||rows().length):document.querySelector('select[name="programTypeId"]')),deadline)){await finish('没有找到登录后的提交页面，未提交。',false);return;}
  const reply=await send({});if(reply.error){banner.textContent=reply.error;return;}
  draft={...reply.data,handle:account(),deadline,phase:'baseline'};save('cfhelper-draft',draft);
  await say('通过正常网页记录提交前的编号，不使用后台抓取请求。');
  if(!isStatus()){location.assign(statusUrl);return;}
 }
 if(draft.phase==='baseline'){
  if(blocked()&&!await waitFor(()=>!blocked(),draft.deadline)){await finish('验证等待超时，未提交。',false);return;}
  if(!isStatus()){location.assign(statusUrl);return;}
  if(!await waitFor(()=>document.querySelector('.status-frame-datatable')||rows().length,draft.deadline)){await finish('无法读取提交前记录，未提交。',false);return;}
  if(account()?.toLowerCase()!==draft.handle.toLowerCase())throw Error('登录账号已变化');
  draft.baseline=Math.max(0,...rows().map(r=>Number(r.dataset.submissionId)));draft.phase='submit';save('cfhelper-draft',draft);
  location.assign(`/problemset/submit?contestId=${draft.contest}&problemIndex=${draft.problem}`);return;
 }
 if(!await waitFor(()=>document.querySelector('select[name="programTypeId"]')&&account(),draft.deadline))throw Error('未找到提交表单');
 if(account()?.toLowerCase()!==draft.handle.toLowerCase())throw Error('登录账号已变化');
 const form=document.querySelector('select[name="programTypeId"]').closest('form');
 const problem=form.querySelector('[name="submittedProblemIndex"]');if(!problem)throw Error('找不到题号选项');problem.value=draft.problem;if(problem.value!==draft.problem)throw Error('题号不可选');
 const lang=form.querySelector('[name="programTypeId"]');const option=selectLanguage(lang.options,draft.language);if(!option)throw Error('编译器不可用，请用 --lang 指定网页中的名称');lang.value=option.value;lang.dispatchEvent(new Event('change',{bubbles:true}));
 const code=form.querySelector('textarea[name="source"]');if(!code)throw Error('找不到源码输入框');code.value=draft.source;code.dispatchEvent(new Event('input',{bubbles:true}));
 const toggle=form.querySelector('input[name="toggleEditorCheckbox"],#toggleEditorCheckbox');if(toggle?.checked)toggle.click();code.value=draft.source;
 const button=form.querySelector('input[type="submit"],button[type="submit"]');if(!button)throw Error('找不到提交按钮');
 const job={...draft,selectedLanguage:option.textContent.trim()};delete job.source;save('cfhelper-pending',job);sessionStorage.removeItem('cfhelper-draft');
 await say(`使用编译器：${job.selectedLanguage}。正在提交。`);button.click();
 await sleep(1000);if(document.contains(form))await monitor(job);
}catch(e){await finish('提交过程停止：'+e.message+'。请核对记录后再重试。',false);}
})();
