'use strict';
const {stripVTControlCharacters}=require('node:util');
const {contestVerdict,contestReport}=require('./extension/verdict');

function clean(text){
 return stripVTControlCharacters(String(text)).replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
}

function problemLabel(spec){
 if(!spec.problem)return '没有默认题号，请点击 c 修改默认题号';
 if(spec.oj==='qoj')return 'QOJ #'+spec.problem+(spec.contest?' / 比赛 '+spec.contest:'');
 if(spec.section==='gym')return 'Gym '+spec.contest+spec.problem;
 return spec.contest+spec.problem;
}

const contestLabels=new Set([
 'correct','wrong-answer','timelimit','run-error','compiler-error','memory-limit',
 'output-limit','no-output','idleness-limit','presentation-error','internal-error',
 'security-violation','skipped','rejected','challenged','pretests-passed','unknown-result'
]);
function finalLabel(verdict){
 if(contestLabels.has(verdict)||/^score: \d+(?:\.\d+)?$/.test(verdict))return verdict;
 if(/^pretests? passed\b/i.test(verdict))return 'pretests-passed';
 return contestVerdict(verdict);
}

// CF and QOJ extensions already send these messages, including in older versions.
function readResult(message){
 const match=/^提交 (?:QOJ #)?(\d+)[：:]\s*([\s\S]+)$/.exec(clean(message));
 if(!match)return null;
 const [,id,body]=match;
 const checker=/ \| (最后(?:普通)?测试点(?: Test #\d+)? checker)[：:]\s*/i.exec(body);
 const fields=(checker?body.slice(0,checker.index):body).split(' | ');
 const verdict=fields.shift();
 return {
  id,verdict,checkerLabel:checker?.[1],checker:checker?body.slice(checker.index+checker[0].length):null,
  time:fields.find(field=>/^\d+(?:\.\d+)?\s*(?:ms|s)$/i.test(field)),
  memory:fields.find(field=>/^\d+(?:\.\d+)?\s*(?:[kmg]i?b|b)$/i.test(field)),
  score:fields.find(field=>/^分数[：:]/.test(field))?.replace(/^分数[：:]\s*/,''),
  extra:fields.filter(field=>!/^分数[：:]|^\d+(?:\.\d+)?\s*(?:ms|s|[kmg]i?b|b)$/i.test(field))
 };
}
function readSubmissionId(message){
 return /^(?:QOJ )?提交编号[：:]\s*(\d+)/.exec(message)?.[1];
}

function terminalMessage(label,message){
 return clean(message).split('\n').map((line,index)=>index?'  '+line:label+'  '+line).join('\n');
}

// Conservative width for deciding when overwriting a terminal line is safe.
function lineWidth(value){
 return Array.from(value,char=>char.charCodeAt(0)<128?1:2).reduce((a,b)=>a+b,0);
}
function terminalTint(output,env){
 const colored=output.isTTY&&env.TERM!=='dumb'&&env.NO_COLOR===undefined;
 return (value,color)=>colored&&color?'\x1b['+color+'m'+value+'\x1b[0m':value;
}
const problemHeaderColors=['97;41','30;102','97;44','97;45','97;40','30;103','97;104','97;101','97;42','30;47','30;43','30;106','30;105','97;46'];
function contestBoardLines(board,tint,columns){
 const penalty=board.startedAt?String(board.problems.reduce((total,problem)=>total+(problem.penaltyMinutes??0),0)):null;
 const penaltyWidth=penalty===null?0:Math.max(6,penalty.length+2);
 const cells=board.problems.map(({index,tries,solved,pending,headerColor,solvedMinutes},position)=>{
  const waiting=pending&&!solved;
  const marker=waiting?'P':'';
  const text=tries?(waiting?'pending ':'')+tries+(tries===1?' try':' tries'):'';
  return {
   index,header:headerColor||problemHeaderColors[position%problemHeaderColors.length],
   solvedTime:Number.isSafeInteger(solvedMinutes)?String(solvedMinutes):'',
   texts:tries?[text,waiting?'pending '+tries:tries+'try',marker+tries,String(tries)]:[''],
   color:solved?'30;102':pending?'97;44':tries?'97;41':0
  };
 });
 const perRow=Math.min(15,cells.length)||1;
 const preferredWidth=Math.max(10,...cells.map(cell=>Math.max(cell.index.length,cell.texts[0].length,cell.solvedTime.length)+2));
 // Leave one terminal column free so its automatic wrapping cannot split the row.
 const availableWidth=Math.floor((columns-2-(penaltyWidth?penaltyWidth+1:0))/perRow)-1;
 const width=Math.max(1,Math.min(preferredWidth,availableWidth));
 const center=(value,cellWidth=width)=>{
  const length=lineWidth(value),left=Math.max(0,Math.floor((cellWidth-length)/2));
  return ' '.repeat(left)+value+' '.repeat(Math.max(0,cellWidth-length-left));
 };
 const lines=[];
 for(let i=0;i<cells.length;i+=perRow){
  const row=cells.slice(i,i+perRow);
  const leading=value=>penaltyWidth?'│'+center(value,penaltyWidth):'';
  lines.push(leading(i===0?'罚时':'')+'│'+row.map(cell=>tint(center(cell.index),cell.header)).join('│')+'│');
  lines.push((penaltyWidth?'├'+'─'.repeat(penaltyWidth)+'┼':'├')+row.map(()=> '─'.repeat(width)).join('┼')+'┤');
  if(penaltyWidth){
   const times=row.map(cell=>tint(center(cell.solvedTime),cell.solvedTime?cell.color:0));
   lines.push(leading(i===0?penalty:'')+'│'+times.join('│')+'│');
  }
  lines.push(leading('')+'│'+row.map(cell=>{
   const text=cell.texts.find(value=>value.length<=width)||cell.texts.at(-1);
   return tint(center(text),cell.color);
  }).join('│')+'│');
 }
 return lines;
}
const submissionDateFormat=new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
function submissionTime(entry,board){
 if(!Number.isSafeInteger(entry.submittedAt)||entry.submittedAt<=0||entry.submittedAt>8640000000000000)return '时间未知';
 if(board?.startedAt&&entry.boardId===board.id&&entry.submittedAt>=board.startedAt){
  const seconds=Math.floor((entry.submittedAt-board.startedAt)/1000);
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60;
  return '+'+[hours,minutes,seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
 }
 return submissionDateFormat.format(entry.submittedAt);
}
function showSubmissionStatus({board,history,site,contest},{output=process.stdout,env=process.env}={}){
 const tint=terminalTint(output,env),lines=[];
 if(board){
  const solved=board.problems.filter(problem=>problem.solved).length;
  lines.push('── '+(board.section==='gym'?'Gym':site.name)+' '+board.contest+' · 过题 '+solved+'/'+board.problems.length+' ──');
  lines.push(...contestBoardLines(board,tint,output.isTTY?output.columns||Infinity:Infinity));
 }
 lines.push('── '+site.name+' · 最近 10 次提交 ──');
 const headers=['提交编号','提交时间','题号','文件','评测结果'];
 const showScore=!contest&&history.some(entry=>entry.score!=null&&entry.score!=='');
 if(!contest)headers.push('耗时','内存');
 if(showScore)headers.push('分数');
 if(!history.length)lines.push('暂无提交结果。');
 const rows=history.map(entry=>{
  const savedVerdict=entry.rawVerdict||entry.verdict;
  const report=entry.state==='pending'?{label:'pending',color:90}:entry.state==='unknown'?{label:'UNKNOW',color:90}:
   contestReport(savedVerdict,{qoj:site.id==='qoj'});
  const verdict=contest||entry.state==='pending'||entry.state==='unknown'?report.label:savedVerdict;
  const fields=['#'+entry.id,submissionTime(entry,board),entry.problem,entry.file,verdict];
  if(!contest)fields.push(entry.time,entry.memory);
  if(showScore)fields.push(entry.score);
  return {fields:fields.map(value=>clean(value==null||value===''?'-':value).replace(/\s/g,' ')),color:report.color};
 });
 if(rows.length){
  const widths=headers.map((header,index)=>Math.max(lineWidth(header),...rows.map(row=>lineWidth(row.fields[index]))));
  const rowText=(fields,color)=>fields.map((value,index)=>{
   const text=index===4?tint(value,color):value;
   return index===fields.length-1?text:text+' '.repeat(widths[index]-lineWidth(value));
  }).join('  |  ');
  lines.push(rowText(headers));
  for(const {fields,color} of rows)lines.push(rowText(fields,color));
 }
 output.write(lines.join('\n')+'\n');
}

const pendingFrames=['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
function createSubmissionView(spec,{output=process.stdout,error=process.stderr,env=process.env}={}){
 const interactive=!!output.isTTY&&env.TERM!=='dumb';
 const tint=terminalTint(output,env);
 const contest=spec.verdictMode==='contest';
 let id,language=spec.language,live=false,previous,animation,reportedId;

 function clear(){
  if(live)output.write('\r\x1b[2K');
  live=false;
 }
 function stopAnimation(){
  clearInterval(animation);
  animation=undefined;
 }
 function print(message,stream=output){
  stopAnimation();
  clear();
  previous=undefined;
  stream.write(message+'\n');
 }
 function status(message){
  if(message==='pending'&&!id)message='等待提交确认';
  const line=text=>terminalMessage('评测',id?'#'+id+'  '+text:text);
  const plain=line(message);
  if(plain===previous)return;
  previous=plain;
  stopAnimation();
  const fits=value=>interactive&&!value.includes('\n')&&lineWidth(value)<output.columns;
  const paint=value=>{
   clear();
   live=fits(value);
   output.write(tint(value,36)+(live?'':'\n'));
  };
  if(contest&&message==='pending'&&fits(line(pendingFrames[0]+' pending'))){
   paint(line(pendingFrames[0]+' pending'));
   let frame=1;
   const tail=' pending'.length;
   animation=setInterval(()=>{
    if(!fits(line(pendingFrames[0]+' pending'))){stopAnimation();return;}
    // Overwrite the spinner cell only, then restore the cursor after " pending".
    output.write('\x1b['+(tail+1)+'D'+tint(pendingFrames[frame++%pendingFrames.length],36)+'\x1b['+tail+'C');
   },120);
   animation.unref();
  }else paint(plain);
 }
 function failure(message){print(terminalMessage('错误',message),error);}

 function showResult(result){
  const report=contest?contestReport(result.verdict,{qoj:spec.oj==='qoj'}):null;
  const normal=contest?null:finalLabel(result.verdict);
  const color=report?.color??(normal==='correct'?32:normal==='pretests-passed'||/^(?:score: |\d)/.test(normal)?33:31);
  const verdict=report?.label??result.verdict;
  const fields=[['Run ID','#'+result.id],['题号',problemLabel(spec)],['结果',verdict]];
  if(!contest)fields.push(['内存',result.memory||'-'],['时间',result.time||'-']);
  fields.push(['语言',language]);
  if(!contest&&result.score)fields.push(['分数',result.score]);
  const columnLine=fields.map(([key,value])=>key+' '+clean(value)).join('  |  ');
  const narrow=interactive&&lineWidth(columnLine)>=output.columns;
  const row=fields.map(([key,value])=>key+' '+(key==='结果'?tint(clean(value),color):clean(value))).join(narrow?'\n  ':'  |  ');
  print(row);
  if(!contest){
   for(const extra of result.extra)print(terminalMessage('详情',extra));
   if(result.checkerLabel)print(terminalMessage(result.checkerLabel,result.checker));
  }
 }

 function event({message,final,ok,submissionId,phase}){
  const value=clean(message);
  if(phase==='judged'&&!final&&!contest){
   const result=readResult(value);
   if(result&&reportedId!==result.id){
    id=reportedId=result.id;
    showResult(result);
    status('正在读取 checker');
   }
   return;
  }
  if(final){
   const result=ok&&readResult(value);
   if(result&&result.id===reportedId){
    if(result.checkerLabel)print(terminalMessage(result.checkerLabel,result.checker));
    else clear();
   }
   else if(result)showResult(result);
   else if(ok)print(terminalMessage('结果',contest?tint('UNKNOW-ERROR',33):value));
   else failure(value);
   return;
  }
  const number=readSubmissionId(value)||(/^[1-9]\d*$/.test(String(submissionId))?String(submissionId):undefined);
  if(number){id=number;status('pending');return;}
  const compiler=/^使用(?: QOJ )?编译器[：:]\s*(.+?)。正在提交。$/.exec(value);
  if(compiler){language=compiler[1];status('正在提交');return;}
  const verdict=/^(?:QOJ )?评测[：:]\s*(.*)$/.exec(value);
  if(verdict||value==='pending'){status(contest?'pending':verdict?.[1]||'pending');return;}
  if(value.startsWith('已点击提交')){status('pending');return;}
  if(value.startsWith('评测已结束，正在通过')){if(!contest)status('正在读取 checker');return;}
  if(/^(?:通过正常网页记录提交前的编号|正在读取 QOJ 当前登录账号|已通过 QOJ 正常提交记录页)/.test(value)){status('准备提交');return;}
  print(terminalMessage('提示',value));
 }
 return {event,status,failure,notice:message=>print(terminalMessage('提示',message))};
}

module.exports={createSubmissionView,problemLabel,terminalMessage,showSubmissionStatus,readResult,readSubmissionId};
