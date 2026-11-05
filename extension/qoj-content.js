(async()=>{
 if(location.origin!=='https://qoj.ac')return;
 const match=/^#qojhelper=(27121:[a-f0-9]{48})$/.exec(location.hash);
 if(match){sessionStorage.setItem('ojhelper-qoj-key',match[1]);history.replaceState(null,'',location.pathname+location.search);}
 const key=sessionStorage.getItem('ojhelper-qoj-key');if(!key)return;
 const send=message=>chrome.runtime.sendMessage({key,oj:'qoj',...message});
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const banner=document.createElement('div');banner.style='position:fixed;top:0;left:0;z-index:2147483647;background:#fff3cd;color:#111;padding:12px;white-space:pre-wrap';document.documentElement.append(banner);
 const save=(key,value)=>sessionStorage.setItem(key,JSON.stringify(value));
 const say=async(message,extra={})=>{banner.textContent=message;const reply=await send({result:{message,...extra}});if(reply?.error)throw Error(reply.error);};
 async function finish(message,ok){for(const name of ['ojhelper-qoj-key','ojhelper-qoj-draft','ojhelper-qoj-pending'])sessionStorage.removeItem(name);await say(message,{final:true,ok});}
 let attention=false;
 async function waitFor(read,deadline){
  while(Date.now()<deadline){
   if(qojBlocked(document)){if(!attention){attention=true;await send({attention:true,result:{message:'QOJ 页面需要登录或网页验证，请在浏览器完成。'}});}}
   else{const result=read();if(result)return result;}
   await sleep(500);
  }
  throw Error('QOJ 页面等待超时，请核对网站记录后重试。');
 }
 const compact=value=>String(value||'').replace(/\s+/g,'').toLowerCase();
 function sameTarget(record,job){return record.id>job.baseline&&record.problem===job.problem&&record.handle?.toLowerCase()===job.handle.toLowerCase()&&(!job.contest||record.contest===job.contest)&&(!job.id||record.id===job.id);}
 async function monitor(job){
  const contestMode=job.verdictMode==='contest';
  let last='',lastChange=Date.now(),reloads=0;
  while(Date.now()<job.deadline){
   await waitFor(()=>true,job.deadline);
   const form=document.querySelector('#form-answer');
   if(form){
    const errors=Array.from(form.querySelectorAll('.text-danger,.has-error .help-block,.error')).map(node=>node.textContent.trim()).filter(Boolean).join('；');
    if(errors){await finish('QOJ 未接受提交：'+errors,false);return;}
    if(Date.now()-job.postedAt<15000){await sleep(500);continue;}
   }
   if(/^\/submission\/[1-9]\d*\/?$/.test(location.pathname)){
    const result=readQojJudgement(document,{includeChecker:!contestMode}),record=result.record;
    if(record){
     if(!sameTarget(record,job))throw Error('QOJ 提交编号、题目或账号与本次任务不匹配');
     if(compact(record.language)!==compact(job.selectedLanguage))throw Error('QOJ 提交编译器与所选语言不匹配');
     if(!job.id){job.id=record.id;save('ojhelper-qoj-pending',job);await say('QOJ 提交编号：'+job.id+'（已核对账号、题号、编译器及新编号）。');}
     if(record.verdict!==last){const first=!last;last=record.verdict;lastChange=Date.now();if(!contestMode)await say('QOJ 评测：'+record.verdict);else if(first&&!qojFinalVerdict(record))await say('pending');}
     if(qojFinalVerdict(record)){
      if(contestMode){await finish('提交 QOJ #'+record.id+'：'+contestVerdict(record.verdict,record.score),true);return;}
      const score=record.score!==null&&record.score!==undefined?' | 分数：'+Number(record.score)+(record.fullScore?' / '+Number(record.fullScore):''):'';
      const summary='提交 QOJ #'+record.id+'：'+record.verdict+score+(record.time?' | '+record.time:'')+(record.memory?' | '+record.memory:'');
      await finish(summary+' | 最后普通测试点'+(result.test?' '+result.test:'')+' checker：'+(result.checker||'无法得知结果（当前权限或页面未提供普通 Test 的 checker）'),true);return;
     }
    }
   }else{
    const candidates=qojSubmissionRows(document).filter(record=>sameTarget(record,job));
    if(candidates.length>1&&!job.id)throw Error('QOJ 出现多条同题新提交，无法唯一关联本次结果');
    if(candidates[0]){location.assign(candidates[0].url);return;}
    if(!/\/submissions\/?$/.test(location.pathname)){location.assign('https://qoj.ac/'+(job.contest?'contest/'+job.contest+'/':'')+'submissions');return;}
   }
   if(Date.now()-lastChange>45000&&reloads<6){job.reloads=(job.reloads||0)+1;if(job.reloads<=6){save('ojhelper-qoj-pending',job);location.reload();return;}reloads=6;}
   await sleep(1000);
  }
  await finish('QOJ 评测等待超时，结果未知。请先核对网站记录，避免重复提交。',false);
 }
 try{
  const pending=sessionStorage.getItem('ojhelper-qoj-pending');if(pending){await monitor(JSON.parse(pending));return;}
  let draft=JSON.parse(sessionStorage.getItem('ojhelper-qoj-draft')||'null');
  if(!draft){
   const deadline=Date.now()+540000;
   await say('正在读取 QOJ 当前登录账号及提交前编号。');
   await waitFor(()=>qojAccount(document)&&Array.from(document.querySelectorAll('table thead th')).some(node=>/^ID$/i.test(node.textContent.trim())),deadline);
   const reply=await send({});if(reply?.error)throw Error(reply.error);if(reply.data?.oj!=='qoj')throw Error('任务 OJ 不匹配');
   draft={...reply.data,handle:qojAccount(document),deadline,baseline:Math.max(0,...qojSubmissionRows(document).map(record=>record.id)),phase:'submit'};
   save('ojhelper-qoj-draft',draft);await say('已通过 QOJ 正常提交记录页记录提交前编号。');location.assign(draft.url);return;
  }
  await waitFor(()=>qojAccount(document)&&document.querySelector('#form-answer'),draft.deadline);
  if(qojAccount(document)?.toLowerCase()!==draft.handle.toLowerCase())throw Error('QOJ 登录账号已变化');
  const target=qojTarget(location.href);if(target.problem!==draft.problem||target.contest!==(draft.contest||null))throw Error('QOJ 提交页面题目或比赛不匹配');
  const source=qojSourceForm(document);if(source.unsupported)throw Error(source.unsupported+'；本次仅支持单文件源码题');
  const option=Array.from(source.language.options).filter(option=>!option.disabled&&option.value).find(option=>compact(option.value)===compact(draft.language)||compact(option.textContent)===compact(draft.language));
  if(!option)throw Error('QOJ 没有可用的 '+draft.language+'，请用 --lang 指定该题页面中的语言');
  source.language.value=option.value;source.language.dispatchEvent(new Event('change',{bubbles:true}));
  const tab=document.querySelector('a[href="#tab-submit-answer"]');tab?.click();
  if(source.file){
   const radio=source.form.querySelector('input[name="'+source.base+'_upload_type"][value="file"]');if(!radio)throw Error('QOJ 文件上传方式不可选');radio.click();
   const files=new DataTransfer();files.items.add(new File([draft.source],draft.fileName||'answer.cpp',{type:'text/plain'}));source.file.files=files.files;source.file.dispatchEvent(new Event('change',{bubbles:true}));
  }else if(source.editor){
   const advanced=document.querySelector('#div-'+source.base+'_editor input[type="checkbox"]');if(advanced?.checked)advanced.click();
   source.editor.value=draft.source;source.editor.dispatchEvent(new Event('input',{bubbles:true}));
  }else throw Error('未找到 QOJ 单文件源码输入控件');
  if(!source.button)throw Error('未找到 QOJ Submit 按钮');
  const job={...draft,selectedLanguage:option.value,postedAt:Date.now()};delete job.source;
  save('ojhelper-qoj-pending',job);sessionStorage.removeItem('ojhelper-qoj-draft');
  await say('使用 QOJ 编译器：'+option.textContent.trim()+'。正在提交。');source.button.click();
  await sleep(1000);if(document.contains(source.form))await monitor(job);
 }catch(error){await finish('QOJ 提交过程停止：'+error.message+'。请先核对网站记录后再重试。',false);}
})();
