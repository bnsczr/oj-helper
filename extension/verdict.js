function isFinalVerdict(text){return /^(Accepted|Wrong answer|Time limit exceeded|Memory limit exceeded|Runtime error|Compilation error|Idleness limit exceeded|Presentation error|Output limit exceeded|Skipped|Rejected|Failed|Challenged|Security violated)/i.test(text.trim());}
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
 const problem=new RegExp(`/(?:problemset/problem/${pending.contest}/${pending.problem}|contest/${pending.contest}/problem/${pending.problem})(?:[?#]|$)`);
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
if(typeof module!=='undefined')module.exports={isFinalVerdict,matchesSubmission,languageSignature,readVerdict,readChecker};
