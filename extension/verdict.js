function isFinalVerdict(text){return /^(Accepted|Wrong answer|Time limit exceeded|Memory limit exceeded|Runtime error|Compilation error|Idleness limit exceeded|Presentation error|Output limit exceeded|Skipped|Rejected|Failed|Challenged|Security violated|Denial of judg(?:e)?ment|Judg(?:e)?ment failed)/i.test(text.trim());}
const contestVerdicts=[
 [/^(?:accepted|correct|ac)\b|^通过/i,'correct'],
 [/^(?:wrong answer|wa)\b|^答案错误/i,'wrong-answer'],
 [/^(?:time limit exceeded|timelimit|tle)\b|^(?:时间超限|超出时间限制)/i,'timelimit'],
 [/^(?:runtime error|run error|re)\b|^运行错误/i,'run-error'],
 [/^(?:compilation error|compile error|compiler error|ce)\b|^编译错误/i,'compiler-error'],
 [/^(?:memory limit exceeded|mle)\b|^(?:内存超限|超出内存限制)/i,'memory-limit'],
 [/^(?:output limit exceeded|ole)\b|^输出超限/i,'output-limit'],
 [/^no output\b/i,'no-output'],
 [/^(?:idleness limit exceeded|ile)\b/i,'idleness-limit'],
 [/^(?:presentation error|pe)\b/i,'presentation-error'],
 [/^(?:denial of judg(?:e)?ment|judg(?:e)?ment failed|internal error|system error|failed|uke|se|jf)\b|^评测失败/i,'internal-error'],
 [/^security violated\b/i,'security-violation'],
 [/^skipped\b/i,'skipped'], [/^rejected\b/i,'rejected'], [/^challenged\b/i,'challenged']
];
function contestVerdict(value,score){
 const text=String(value??'').trim(),match=contestVerdicts.find(([pattern])=>pattern.test(text));
 if(match)return match[1];
 if(/^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/.test(text))return text;
 if(score!=null&&String(score).trim()&&Number.isFinite(Number(score)))return 'score: '+Number(score);
 return 'unknown-result';
}
const contestReportLabels={
 correct:'CORRECT','wrong-answer':'WRONG-ANSWER',timelimit:'TIME-LIMIT','run-error':'RUN-ERROR',
 'memory-limit':'MEMORY-LIMIT','idleness-limit':'IDLENESS-LIMIT'
};
function contestReport(value,{qoj=false}={}){
 function label(text){
  const aliases={tl:'timelimit',ml:'memory-limit',il:'idleness-limit','time-limit':'timelimit'};
  const key=text.toLowerCase().trim();
  const abbreviation=/^(?:tl|ml|il)\b/.exec(key)?.[0]||key;
  const verdict=Object.hasOwn(aliases,abbreviation)?aliases[abbreviation]
   :Object.hasOwn(contestReportLabels,key)?key:contestVerdict(text);
  return Object.hasOwn(contestReportLabels,verdict)?contestReportLabels[verdict]:'UNKNOW-ERROR';
 }
 const text=String(value??'').trim();
 const parts=text.split(/[,，]/).map(part=>part.trim()).filter(Boolean);
 if(qoj&&parts.length>1&&label(parts[0])==='CORRECT'){
  return {label:parts.map(label).join(', '),color:33};
 }
 const result=label(text);
 return {label:result,color:result==='CORRECT'?32:result==='UNKNOW-ERROR'?33:31};
}
function isPenaltyVerdict(value){
 return String(value??'').split(/[,，]/).some(part=>{
  const label=contestReport(part).label;
  return (label!=='CORRECT'&&label!=='UNKNOW-ERROR')||
   ['output-limit','no-output','presentation-error','security-violation','rejected','challenged'].includes(contestVerdict(part));
 });
}
function readVerdict(row){
 // submissionid also appears on the ID link. Only inspect verdict cells.
 const cell=row.querySelector('td.status-verdict-cell')||row.cells?.[5];
 const wrapper=cell?.querySelector?.('.submissionVerdictWrapper');
 const text=(wrapper?.textContent||cell?.textContent||'').trim().replace(/\s+/g,' ');
 return text&&!/^\d+$/.test(text)?text:'等待评测';
}
function languageSignature(s){
 const text=s.replace(/\s+/g,' ').trim().toLowerCase();
 const cpp=/(?:g|c)\+\+\s*(\d+)/.exec(text);if(cpp)return 'cpp'+cpp[1];
 const pypy=/pypy\s*(\d)/.exec(text);if(pypy)return 'pypy'+pypy[1];
 const python=/python\s*(\d)/.exec(text);if(python)return 'python'+python[1];
 const java=/(?:java|openjdk)\s*(\d+)/.exec(text);if(java)return 'java'+java[1];
 const c=/\bc\s*(\d+)/.exec(text);if(c)return 'c'+c[1];
 if(/rust/.test(text))return 'rust';return text;
}
function matchesSubmission(row,pending){
 if(pending.id)return row.id===pending.id;
 if(row.id<=pending.baseline)return false;
 const target=pending.section==='gym'
  ?'gym/'+pending.contest+'/problem/'+pending.problem
  :'(?:problemset/problem/'+pending.contest+'/'+pending.problem+'|contest/'+pending.contest+'/problem/'+pending.problem+')';
 const problem=new RegExp('/'+target+'/?(?:[?#]|$)');
 const author=row.links.some(h=>h.split(/[?#]/)[0].toLowerCase()===`/profile/${pending.handle}`.toLowerCase());
 return author&&row.links.some(h=>problem.test(h))&&languageSignature(row.language)===languageSignature(pending.selectedLanguage);
}
function readChecker(root,summary){
 const tests=[...root.querySelectorAll('.test-for-popup, .test')].filter(t=>!t.parentElement?.closest('.test-for-popup, .test'));
 const records=tests.map((t,i)=>{
  const header=t.querySelector('.test-header, .title')?.textContent||t.textContent||'';
  const number=Number(/(?:#|test\s*:?\s*)(\d+)/i.exec(header)?.[1]||i+1);
  let comment=t.querySelector('.checker-comment pre, .checker-comment, .checkerComment')?.textContent.trim();
  if(!comment){
   const label=[...t.querySelectorAll('div, span, b, strong')].find(e=>/^checker\s*(?:comment|log)\s*:?$/i.test(e.textContent.trim()));
   comment=label?.nextElementSibling?.textContent.trim()||label?.parentElement?.querySelector('pre, textarea')?.textContent.trim();
  }
  return {number,comment};
 });
 // The source popup also renders Judgement Protocol without .test wrappers.
 // Parse only that protocol, never source code, input, output or answer text.
 const text=root.innerText||root.textContent||'';
 const protocol=text.split(/Judg(?:e)?ment Protocol/i)[1];
 if(protocol){
  const chunks=protocol.split(/(?=Test:\s*#\d+\s*,\s*time:)/i);
  for(const chunk of chunks){
   const number=Number(/^Test:\s*#(\d+)/i.exec(chunk.trim())?.[1]);
   const match=/(?:^|\n)\s*Checker\s+(?:Log|comment)\s*:?[^\S\n]*(?:Copy)?\s*\n([\s\S]*?)(?=\n\s*(?:Test:\s*#|Diagnostics|Input|Output|Answer)\b|$)/i.exec(chunk);
   const comment=match?.[1].replace(/^Copy\s*\n/i,'').trim();
   if(number&&comment&&!records.some(r=>r.number===number&&r.comment))records.push({number,comment});
  }
 }
 records.sort((a,b)=>a.number-b.number);
 const expected=/on (?:pre)?test (\d+)/i.exec(summary);
 const last=expected?records.find(r=>r.number===Number(expected[1])):records.at(-1);
 return last?.comment||null;
}
if(typeof module!=='undefined')module.exports={isFinalVerdict,matchesSubmission,languageSignature,readVerdict,readChecker,contestVerdict,contestReport,isPenaltyVerdict};
