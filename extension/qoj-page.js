function qojText(node){
 if(!node)return '';
 if(node.nodeType===3)return node.nodeValue||'';
 if(node.nodeName==='BR')return '\n';
 if(['SCRIPT','STYLE','BUTTON'].includes(node.nodeName))return '';
 const value=Array.from(node.childNodes||[]).map(qojText).join('');
 return /^(DIV|P|LI|H[1-6]|TR)$/.test(node.nodeName)?'\n'+value+'\n':value;
}
function qojAccount(root=document){
 const link=root.querySelector('nav a.uoj-username[href*="/user/profile/"], .navbar a.uoj-username[href*="/user/profile/"], .nav a.uoj-username[href*="/user/profile/"]');
 try{return link?decodeURIComponent(new URL(link.getAttribute('href'),location.href).pathname.split('/').at(-1)):null;}catch{return null;}
}
function qojBlocked(root=document){return /just a moment|attention required|security verification/i.test(root.title||'')||!!root.querySelector('#challenge-running,#challenge-stage,input[type="password"]');}
function qojSourceForm(root=document){
 const form=root.querySelector('#form-answer');if(!form)return {waiting:true};
 const languages=Array.from(form.querySelectorAll('select[name$="_language"]'));
 const groups=Array.from(form.querySelectorAll('[id^="form-group-answer_"]'));
 if(languages.length!==1||groups.length!==1)return {unsupported:languages.length?'多文件题':'提交答案题或非源码题'};
 const language=languages[0],base=language.name.replace(/_language$/,'');
 return {form,language,base,editor:form.querySelector('textarea[name="'+base+'_editor"]'),file:form.querySelector('input[type="file"][name="'+base+'_file"]'),button:form.querySelector('#button-submit-answer')};
}
function readQojDashboard(root=document,value=location.href){
 const dashboard=qojDashboard(value);if(!dashboard)throw Error('当前页面不是 QOJ 比赛 Dashboard。');
 if(qojBlocked(root))return {waiting:true,challenge:true};
 const seen=new Set(),problems=[];
 for(const link of root.querySelectorAll('table a[href]')){
  let target;try{target=qojTarget(new URL(link.getAttribute('href'),value).href);}catch{continue;}
  if(target.contest!==dashboard.contest||seen.has(target.problem))continue;
  const row=link.closest('tr'),label=row?.querySelector('td')?.textContent.trim();
  if(!/^[A-Z]+\d*$/.test(label||''))throw Error('QOJ 比赛题号不是可识别的字母编号，未导入。');
  seen.add(target.problem);problems.push({index:label,url:target.url,problem:target.problem,title:link.textContent.trim()});
 }
 if(!problems.length)throw Error('未读取到 QOJ 比赛题目列表，请等待加载或完成登录。');
 const external=Array.from(root.querySelectorAll('a[href]')).find(link=>/^(?:Extra|External)\s+Standings$/i.test(link.textContent.trim()));
 let extraUrl=null;if(external){const url=new URL(external.getAttribute('href'),value);if(url.origin==='https://qoj.ac'&&/^\/results\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))extraUrl=url.href;}
 return {...dashboard,problems,extraUrl};
}
function qojMarkdown(node,source){
 function render(n){
  if(n.nodeType===3)return (n.nodeValue||'').replace(/\u00a0/g,' ');
  const tag=n.nodeName;
  if(['STYLE','BUTTON','NOSCRIPT'].includes(tag)||n.classList?.contains('MathJax'))return '';
  if(tag==='SCRIPT')return /^math\/tex/.test(n.getAttribute('type')||'')?' $'+n.textContent+'$ ':'';
  if(tag==='BR')return '\n';
  if(tag==='PRE'){const text=qojText(n).trim();const fence='`'.repeat(Math.max(3,...(text.match(/`+/g)||[]).map(x=>x.length+1)));return '\n\n'+fence+'text\n'+text+'\n'+fence+'\n\n';}
  if(tag==='IMG')return '!['+(n.getAttribute('alt')||'图片')+']('+new URL(n.getAttribute('src'),source).href+')';
  const body=Array.from(n.childNodes||[]).map(render).join('');
  if(tag==='A')return '['+body.trim()+']('+new URL(n.getAttribute('href'),source).href+')';
  if(/^H[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Math.min(6,Number(tag[1])+1))+' '+body.trim()+'\n\n';
  if(tag==='B'||tag==='STRONG')return '**'+body+'**';
  if(tag==='LI')return '\n- '+body.trim()+'\n';
  if(tag==='TD'||tag==='TH')return body.trim()+' | ';
  if(tag==='TR')return '\n| '+body+'\n';
  return /^(DIV|P|UL|OL|TABLE)$/.test(tag)?'\n\n'+body.trim()+'\n\n':body;
 }
 return render(node).trim();
}
function readQojProblemPage(root=document,value=location.href){
 if(qojBlocked(root))return {waiting:true,challenge:true};
 const target=qojTarget(value),title=root.querySelector('h1.text-center, h1.col-md-7, .problem-title');
 const tab=root.querySelector('#tab-statement, .uoj-problem-statement, #problem-statement');
 if(!title||!tab)return {waiting:true};
 const source=qojSourceForm(root);if(source.unsupported)return {error:source.unsupported+'；本次仅支持单文件源码题。'};
 const pdfNode=tab.querySelector('iframe[src], object[data], embed[src]');
 const pdfUrl=pdfNode?new URL(pdfNode.getAttribute('src')||pdfNode.getAttribute('data'),value).href:null;
 const attachment=Array.from(root.querySelectorAll('a[href]')).find(link=>/^Attachments$/i.test(link.textContent.trim()));
 const attachmentUrl=attachment?new URL(attachment.getAttribute('href'),value).href:null;
 const inputs=[],outputs=[];
 for(const heading of tab.querySelectorAll('h2,h3,h4,h5')){
  const label=heading.textContent.trim(),next=heading.nextElementSibling;
  const pre=next?.nodeName==='PRE'?next:next?.querySelector('pre');if(!pre)continue;
  if(/^(?:Sample\s*Input|Input\s*(?:Sample|Example)|样例输入|输入样例)/i.test(label))inputs.push(qojText(pre).replace(/^\n|\n$/g,''));
  if(/^(?:Sample\s*Output|Output\s*(?:Sample|Example)|样例输出|输出样例)/i.test(label))outputs.push(qojText(pre).replace(/^\n|\n$/g,''));
 }
 if(inputs.length!==outputs.length)return {error:'QOJ HTML 样例输入输出不配对，未覆盖文件。'};
 const contests=Array.from(root.querySelectorAll('a[href]')).map(link=>{try{return qojDashboard(new URL(link.getAttribute('href'),value).href)?.contest;}catch{return null;}}).filter(Boolean);
 return {problem:{url:target.url,title:title.textContent.replace(/\s+/g,' ').trim(),statement:'# '+title.textContent.replace(/\s+/g,' ').trim()+'\n\n[QOJ 题目]('+target.url+')\n\n'+(pdfUrl?'':qojMarkdown(tab,value)),samples:inputs.map((input,index)=>({input,output:outputs[index]})),pdfUrl,attachmentUrl,contests:Array.from(new Set(contests))}};
}
function qojSubmissionRows(root=document){
 const rows=[];
 for(const row of root.querySelectorAll('table tbody tr')){
  const link=row.querySelector('a[href^="/submission/"]');if(!link)continue;
  const match=/^\/submission\/([1-9]\d*)\/?$/.exec(new URL(link.getAttribute('href'),location.href).pathname);if(!match)continue;
  const cells=Array.from(row.querySelectorAll('td')),headers=Array.from(row.closest('table').querySelectorAll('thead th')).map(x=>x.textContent.trim().toLowerCase());
  const value=name=>{const index=headers.indexOf(name);return index>=0?cells[index]?.textContent.trim()||'':'';};
  let target=null;for(const a of row.querySelectorAll('a[href]'))try{target=qojTarget(new URL(a.getAttribute('href'),location.href).href);break;}catch{}
  const who=row.querySelector('a[href*="/user/profile/"]'),score=row.querySelector('.uoj-score');
  rows.push({id:Number(match[1]),problem:target?.problem,contest:target?.contest,handle:who?.textContent.trim(),verdict:value('result'),score:score?.getAttribute('data-score'),fullScore:score?.getAttribute('data-full'),time:value('time'),memory:value('memory'),language:value('language'),url:'https://qoj.ac/submission/'+match[1]});
 }
 return rows;
}
function qojFinalVerdict(record){return !!record.verdict&&!/waiting|judging|compiling|running|pending|queue|测试中|评测中|等待/i.test(record.verdict)&&(/^(?:AC|WA|RE|TLE|MLE|OLE|CE|UKE|SE|JF)\b|accepted|wrong answer|runtime error|time limit|memory limit|compile error|compilation error|judgement failed/i.test(record.verdict)||Number.isFinite(Number(record.score))&&record.score!==null&&record.score!==undefined&&record.score!=='');}
function readQojJudgement(root=document,{includeChecker=true}={}){
 const record=qojSubmissionRows(root)[0];if(!record)return {waiting:true};
 if(!qojFinalVerdict(record))return {record,waiting:true};
 if(!includeChecker)return {record};
 const cards=Array.from(root.querySelectorAll('#details_details_accordion .card-header')).map(header=>({header,title:header.querySelector('.card-title')?.textContent.trim()||''})).filter(item=>/^Test\s*#\s*\d+\s*:/i.test(item.title));
 let checker=null,test=null;
 if(cards.length){
  const last=cards.at(-1),number=/^Test\s*#\s*(\d+)/i.exec(last.title)[1];test='Test #'+number;
  const card=last.header.closest('.card');const label=Array.from(card.querySelectorAll('h4,h5,strong')).find(node=>/^result\s*:\s*$/i.test(node.textContent.trim()));
  const result=label?.nextElementSibling;if(result?.nodeName==='PRE'&&result.textContent.trim())checker=result.textContent.trim();
 }
 return {record,test,checker,detailsAvailable:!!root.querySelector('#details_details_accordion')};
}
function readQojExternalStandings(expected){
 if(location.origin!=='https://qoj.ac'||!/^\/results\/[A-Za-z0-9_-]+\/?$/.test(location.pathname))return {waiting:true};
 if(qojBlocked(document))return {waiting:true,challenge:true};
 const contestUrl='https://qoj.ac/contest/'+expected.contest;
 if(!Array.from(document.querySelectorAll('a[href]')).some(link=>new URL(link.getAttribute('href'),location.href).href.replace(/\/$/,'')===contestUrl))return {error:'External Standings 未关联当前比赛。'};
 const table=document.querySelector('table.standings');if(!table)return {waiting:true};
 const rows=Array.from(table.querySelectorAll('tr')).filter(row=>row.closest('table')===table);
 const cells=row=>Array.from(row.querySelectorAll(':scope > th,:scope > td')).map(cell=>qojText(cell).replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim());
 const headers=cells(rows[0]);if(!headers.length)return {waiting:true};
 return {snapshot:{oj:'qoj',kind:'external-standings',contest:expected.contest,section:'contest',contestUrl,url:location.href,title:document.querySelector('h2,h1')?.textContent.trim()||'External Standings',description:'',handle:null,headers,rows:rows.slice(1).map(cells),pages:[],capturedAt:new Date().toISOString()}};
}
if(typeof module!=='undefined')module.exports={qojText,qojAccount,qojBlocked,qojSourceForm,readQojDashboard,qojMarkdown,readQojProblemPage,qojSubmissionRows,qojFinalVerdict,readQojJudgement,readQojExternalStandings};
