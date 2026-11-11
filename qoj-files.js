'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const {qojTarget,qojDashboard}=require('./extension/qoj');
const {appendSamples}=require('./samples'),{DEFAULT_INITIAL_CONTENT}=require('./extension/template');
const {snapshotSources,pendingImport,writeImportedSource,preservedSourceWarning}=require('./files-server');
const {preferencesFile,readPreferences,updatePreferences,fileKey,sequenceName,withStateLock,verdictModeFor,newContestBoard}=require('./preferences');
const {pdfToMarkdown,pdfMarkdown,pdfAssets}=require('./qoj-pdf');
const LIMIT=16*1024*1024;
function sampleMarkdown(samples){
 const block=text=>{const fence='`'.repeat(Math.max(3,...(text.match(/`+/g)||[]).map(run=>run.length+1)));return fence+'text\n'+text+(text.endsWith('\n')?'':'\n')+fence;};
 return samples.length?'\n\n## 导入样例\n\n'+samples.map((sample,index)=>'### 样例 '+(index+1)+'\n\n'+(sample.transcript!==undefined?block(sample.transcript):'输入：\n\n'+block(sample.input)+'\n\n输出：\n\n'+block(sample.output))).join('\n\n')+'\n':'';
}
function resourceBytes(resource,problem,type){
 if(!resource)return null;
 const url=new URL(resource.url);
 if(url.origin!=='https://qoj.ac'||url.username||url.password||url.pathname!=='/download.php'||url.searchParams.get('id')!==problem||url.searchParams.get('type')!==type)throw Error('QOJ 附件网址与题号不匹配。');
 if(typeof resource.base64!=='string'||resource.base64.length>Math.ceil(LIMIT/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(resource.base64))throw Error('QOJ 附件无效或超过 16 MiB。');
 const bytes=Buffer.from(resource.base64,'base64');if(!bytes.length||bytes.length>LIMIT)throw Error('QOJ 附件为空或过大。');return bytes;
}
function zipSamples(bytes){
 if(bytes.length<22)throw Error('QOJ 样例附件不是完整 ZIP。');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('QOJ 附件不是 ZIP，不能可靠读取样例。');
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
 if(count>5000||offset+size>end||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('QOJ ZIP 格式不受支持或目录损坏。');
 const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 const crc=data=>{let c=0xffffffff;for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const entries=new Map();let cursor=offset,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>offset+size||bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('QOJ ZIP 中央目录损坏。');
  const nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),next=cursor+46+nameLength+extra+comment;
  if(next>offset+size)throw Error('QOJ ZIP 文件名越界。');
  const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8').replace(/\\/g,'/');
  const match=/^(.*)\.(in|input|out|output|ans)$/i.exec(name);
  if(match){
   const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24),local=bytes.readUInt32LE(cursor+42);
   if(flags&1||length>8*1024*1024||(total+=length)>32*1024*1024)throw Error('QOJ 样例附件加密或解压后过大。');
   if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)throw Error('QOJ ZIP 本地文件头损坏。');
   const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
   if(start+compressed>offset)throw Error('QOJ ZIP 样例数据越界。');
   const packed=bytes.subarray(start,start+compressed),data=method===0?packed:method===8?zlib.inflateRawSync(packed,{maxOutputLength:8*1024*1024}):null;
   if(!data||data.length!==length||crc(data)!==bytes.readUInt32LE(cursor+16))throw Error('QOJ ZIP 样例校验失败或压缩格式不受支持。');
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data).replace(/\r\n?/g,'\n');}catch{throw Error('QOJ 样例不是 UTF-8 文本，未转换。');}
   if(text.includes('\0'))throw Error('QOJ 附件含二进制样例，本次不支持。');
   const key=match[1].toLowerCase(),kind=/^(in|input)$/i.test(match[2])?'input':'output';
   const pair=entries.get(key)||{};if(pair[kind]!==undefined&&pair[kind]!==text)throw Error('QOJ 附件存在同名但内容不同的样例。');pair[kind]=text;entries.set(key,pair);
  }
  cursor=next;
 }
 if(!entries.size)return [];
 return Array.from(entries.entries()).sort(([a],[b])=>a.localeCompare(b,'en',{numeric:true})).map(([name,pair])=>{if(pair.input===undefined||pair.output===undefined)throw Error('QOJ 样例缺少输入或输出：'+name);return pair;});
}
function prepareProblem(problem,index){
 if(!problem||typeof problem.url!=='string')throw Error('QOJ 题目记录无效。');
 const target=qojTarget(problem.url);
 if(problem.unsupported)throw Error('QOJ #'+target.problem+'：'+problem.unsupported+'；本次仅支持单文件源码题。');
 if(typeof problem.statement!=='string'||!problem.statement.trim())throw Error('QOJ #'+target.problem+' 题面未读取完整。');
 const warnings=[],pdf=resourceBytes(problem.pdf,target.problem,'statement'),attachment=resourceBytes(problem.attachment,target.problem,'problem');
 if(problem.multiSource===true)warnings.push('QOJ #'+target.problem+' 需要提交多个文件，单文件 submit 不适用，请使用网页提交。');
 if(pdf&&!pdf.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('QOJ PDF 下载结果不是 PDF，可能需要登录或验证。');
 let samples=problem.samples||[];appendSamples('',samples);
 if(attachment){
  try{const zipped=zipSamples(attachment),known=new Set(samples.map(s=>JSON.stringify(s)));samples=[...samples,...zipped.filter(s=>!known.has(JSON.stringify(s)))];}
  catch(error){warnings.push('QOJ #'+target.problem+' 样例读取不完整：'+error.message);}
 }
 if(!samples.length)warnings.push('QOJ #'+target.problem+' 未读取到可完整配对的样例。');
 const pdfName=pdf?'QOJ-'+target.problem+'.pdf':null;
 const statement=problem.statement;
 const contests=Array.from(new Set((problem.contests||[]).filter(id=>/^[1-9]\d*$/.test(id))));
 return {target,index,samples,pdf,pdfName,pdfUrl:problem.pdf?.url,statement,contests,warnings};
}
async function ensureFile(target){try{if(!(await fs.lstat(target)).isFile())throw Error(path.basename(target)+' 不是普通文件，未覆盖。');return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function ensureAssetDirectory(directory){
 const target=path.join(directory,'statements');try{if(!(await fs.lstat(target)).isDirectory())throw Error('statements 不是普通目录。');return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}
}
async function upgradeQojStatement(addition){
 if(addition.statementVersion>=2||typeof addition.statement!=='string')return addition;
 const matches=Array.from(addition.statement.matchAll(/\[PDF 题面原件\]\(statements\/QOJ-([1-9]\d*)\.pdf\)/g));
 if(!matches.length)return addition;
 if(!await ensureAssetDirectory(addition.directory))throw Error('没有保存的 QOJ PDF 原件，请在题目页重新添加。');
 const converted=new Map(),assets=[];
 for(const match of matches){
  const id=match[1];if(converted.has(id))continue;
  const target=path.join(addition.directory,'statements','QOJ-'+id+'.pdf');
  if(!await ensureFile(target))throw Error('QOJ #'+id+' 的 PDF 原件缺失，请在题目页重新添加。');
  const result=await pdfToMarkdown(await fs.readFile(target));converted.set(id,result);assets.push(...pdfAssets(result,id));
 }
 for(const asset of assets)await ensureFile(path.join(addition.directory,'statements',asset.name));
 for(const asset of assets)await fs.writeFile(path.join(addition.directory,'statements',asset.name),asset.bytes);
 const statement=addition.statement.replace(/\[PDF 题面原件\]\(statements\/QOJ-([1-9]\d*)\.pdf\)/g,(link,id)=>pdfMarkdown(converted.get(id),id)+'\n'+link);
 return {...addition,statement,statementVersion:2};
}
async function createQojFiles(message,stateFile=preferencesFile,{importId,finishId,earlyMapping,startedAt}={}){
 const {directory}=message;if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('保存目录必须是绝对路径。');if(!(await fs.stat(directory)).isDirectory())throw Error('保存目录不存在。');
 const initial=message.initialContent===undefined?DEFAULT_INITIAL_CONTENT:message.initialContent;if(typeof initial!=='string')throw Error('初始内容必须是文本。');
 const dashboard=message.action==='qoj-create-dashboard'?qojDashboard(message.url):null;
 if(message.action==='qoj-create-dashboard'&&!dashboard)throw Error('QOJ 比赛网址无效。');
 const input=dashboard?message.problems:[message.problem];if(!Array.isArray(input)||!input.length)throw Error('QOJ 题目列表为空。');
 const prepared=input.map((problem,index)=>prepareProblem(problem,dashboard?(problem?.index||sequenceName(index).slice(0,-4)):/^([A-Z]+\d*)\s*[.．]/.exec(problem?.title||'')?.[1]));
 const seen=new Set();for(const problem of prepared){if(dashboard&&(!/^[A-Z]+\d*$/.test(problem.index)||problem.target.contest!==dashboard.contest||seen.has(problem.index)))throw Error('QOJ 比赛题号重复或不属于当前比赛。');seen.add(problem.index);}
 for(const problem of prepared){
  problem.assets=[];
  if(problem.pdf){
   const converted=await pdfToMarkdown(problem.pdf);problem.assets=pdfAssets(converted,problem.target.problem);
   problem.contestStatement=problem.statement+'\n\n[PDF 题面原件]('+new URL(problem.pdfUrl).href+')\n\n'+converted.pages.map(page=>page.text).join('\n\n');
   problem.statement+=pdfMarkdown(converted,problem.target.problem)+'\n\n[PDF 题面原件](statements/'+problem.pdfName+')\n';
   if(converted.pages.some(page=>!page.text))problem.warnings.push('QOJ #'+problem.target.problem+' 的部分 PDF 页面没有可提取文字，已在 Markdown 中完整嵌入页面图像。');
  }
  problem.statement+=sampleMarkdown(problem.samples);
 }
 return withStateLock(stateFile,async()=>{
  const state=readPreferences(stateFile),profile=state.qoj||{},directoryKey=fileKey(directory),old=profile.assignments?.[directoryKey]||{next:0,problems:{}};
  const url=dashboard?.url||prepared[0].target.url,kind=dashboard?'contest':'problem';
  const plan=pendingImport(state,'qoj',finishId,url,directory,kind);
  const emptySource=!plan&&verdictModeFor(state)==='contest';
  if(importId&&!emptySource&&!earlyMapping)return {mappingOnly:false};
  const writeFiles=!emptySource&&!importId;
  let next=dashboard?0:old.next,assigned=dashboard?{}:{...old.problems};
  const fileProblems={...profile.fileProblems};
  for(const problem of prepared){
   const known=assigned[problem.target.problem];while(!dashboard&&!emptySource&&!known&&Object.values(assigned).includes(sequenceName(next)))next++;
   problem.name=dashboard?problem.index+'.cpp':emptySource?((problem.target.contest&&problem.index)||problem.target.problem)+'.cpp':known||sequenceName(next++);
   for(const id of Object.keys(assigned))if(assigned[id]===problem.name)delete assigned[id];
   assigned[problem.target.problem]=problem.name;
   problem.path=path.join(directory,problem.name);if(writeFiles)problem.existed=await ensureFile(problem.path);problem.defaultProblem=problem.target.contest?problem.target.url:problem.target.problem;
   if(writeFiles&&problem.pdf){await ensureFile(path.join(directory,'statements',problem.pdfName));for(const asset of problem.assets)await ensureFile(path.join(directory,'statements',asset.name));}
  }
  const sourceVersions=importId&&!emptySource?await snapshotSources(prepared):undefined;
  if(writeFiles&&prepared.some(problem=>problem.pdf)){
   if(!await ensureAssetDirectory(directory))await fs.mkdir(path.join(directory,'statements'));
  }
  for(const problem of prepared){
   if(writeFiles){
    if(problem.pdf)await fs.writeFile(path.join(directory,'statements',problem.pdfName),problem.pdf);
    for(const asset of problem.assets)await fs.writeFile(path.join(directory,'statements',asset.name),asset.bytes);
    problem.sourcePreserved=!await writeImportedSource(problem,appendSamples(initial,problem.samples),plan);
    if(problem.sourcePreserved)problem.warnings.push(preservedSourceWarning(problem));
   }
   fileProblems[fileKey(problem.path)]=problem.defaultProblem;
  }
  while(Object.values(assigned).includes(sequenceName(next)))next++;
  const statement=prepared.map(problem=>emptySource&&problem.contestStatement?problem.contestStatement+sampleMarkdown(problem.samples):problem.statement).join('\n\n---\n\n'),single=prepared[0];
  const addition={oj:'qoj',kind,contest:dashboard?.contest||single.target.contest,problem:dashboard?undefined:single.target.problem,section:'contest',url,directory,statement:importId?null:statement,importId:plan?.importId??importId,startedAt:plan?.startedAt??startedAt,sourceVersions,statementVersion:2,contests:dashboard?[dashboard.contest]:single.contests};
  if(plan)updatePreferences({qoj:{...profile,lastAddition:addition}},stateFile);
  else{
   const contestBoard=dashboard?newContestBoard(addition,prepared.map(problem=>({index:problem.index,target:problem.defaultProblem})),importId):profile.contestBoard;
   updatePreferences({activeOj:'qoj',qoj:{...profile,lastAddition:addition,defaultProblem:prepared.at(-1).defaultProblem,fileProblems,contestBoard,assignments:{...profile.assignments,[directoryKey]:{next,problems:assigned}}}},stateFile);
  }
  const files=prepared.map(problem=>({name:problem.name,path:problem.path,existed:problem.existed,defaultProblem:problem.defaultProblem,sampleCount:writeFiles&&!problem.sourcePreserved?problem.samples.length:0}));
  return {oj:'qoj',...(dashboard?{contest:dashboard.contest,files}:files[0]),...(importId||emptySource?{mappingOnly:emptySource,importId}: {}),addition,warnings:importId?[]:prepared.flatMap(problem=>problem.warnings)};
 });
}
module.exports={resourceBytes,zipSamples,prepareProblem,createQojFiles,upgradeQojStatement,sampleMarkdown};
