
'use strict';
const fs=require('node:fs'),path=require('node:path');
const preferencesFile=path.join(__dirname,'.submit-preferences.json');
const ojModes={cf:{id:'cf',name:'Codeforces',available:true},qoj:{id:'qoj',name:'QOJ',available:true}};
function ojModeFor(state={}){
 const id=String(state.activeOj??'cf').trim().toLowerCase(),mode=ojModes[id];
 if(!Object.hasOwn(ojModes,id))throw Error('不支持的 OJ，请使用 oj CF 或 oj qoj。');
 return mode;
}
async function selectOj(value,file=preferencesFile){
 const mode=ojModeFor({activeOj:value});
 await withStateLock(file,()=>updatePreferences({activeOj:mode.id},file));return mode;
}
function requireAvailableOj(state){
 const mode=ojModeFor(state);
 if(!mode.available)throw Error('当前为 '+mode.name+' 模式，功能暂未实现。请运行 oj CF 切回 Codeforces。');
 return mode;
}
function profileFor(state,oj=ojModeFor(state).id){return oj==='cf'?state:(state.qoj||{});}
function profilePatch(state,patch,oj){return oj==='cf'?patch:{qoj:{...state.qoj,...patch}};}
async function updateOjPreferences(patch,oj,file=preferencesFile){
 return withStateLock(file,()=>updatePreferences(profilePatch(readPreferences(file),patch,oj),file));
}
function parseProblem(value,oj='cf'){
 if(oj==='qoj')return require('./extension/qoj').qojTarget(value);
 const m=/^([1-9]\d*)([a-z]\d*)$/i.exec(String(value).trim());
 if(!m)throw Error('请输入完整题号，例如 2278F 或 123B1。');
 return {contest:m[1],problem:m[2].toUpperCase()};
}
function readPreferences(file=preferencesFile){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('读取提交偏好失败：'+e.message);}
}
function updatePreferences(patch,file=preferencesFile){
 const state={...readPreferences(file),...patch};
 const temp=file+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return state;
}
function languageType(file){
 const ext=path.extname(file).toLowerCase();
 const types={'.cpp':'cpp','.cc':'cpp','.cxx':'cpp','.c':'c','.py':'python','.java':'java','.rs':'rust'};
 if(!types[ext])throw Error('不支持的文件类型');return types[ext];
}
function languageFor(file,state,oj=ojModeFor(state).id){
 const type=languageType(file);
 return profileFor(state,oj).languages?.[type]||(oj==='qoj'?{cpp:'C++23',c:'C11',python:'Python 3',java:'Java',rust:'Rust'}:{cpp:'GNU G++23',c:'C',python:'Python',java:'Java',rust:'Rust'})[type];
}
function fileKey(file){const absolute=path.resolve(file);return process.platform==='win32'?absolute.toLowerCase():absolute;}
function defaultFor(file,state,oj=ojModeFor(state).id){const profile=profileFor(state,oj);return profile.fileProblems?.[fileKey(file)]||profile.defaultProblem;}
function sequenceName(index){let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name+'.cpp';}
async function withStateLock(file,operation){
 const lock=file+'.lock';let handle;
 for(let attempt=0;attempt<100;attempt++){
  try{handle=await fs.promises.open(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(resolve=>setTimeout(resolve,50));}
 }
 if(!handle)throw Error('题号记录正在更新，请稍后重试。');
 try{return await operation();}finally{await handle.close();await fs.promises.unlink(lock);}
}
async function clearDefaults(file=preferencesFile,oj){return withStateLock(file,()=>{const state=readPreferences(file);return updatePreferences(profilePatch(state,{defaultProblem:null,fileProblems:{},assignments:{},lastAddition:null},oj||ojModeFor(state).id),file);});}
async function saveDefault(file,problem,stateFile=preferencesFile,oj){
 return withStateLock(stateFile,()=>{const state=readPreferences(stateFile),site=oj||ojModeFor(state).id;parseProblem(problem,site);const profile=profileFor(state,site);return updatePreferences(profilePatch(state,{defaultProblem:problem,fileProblems:{...profile.fileProblems,[fileKey(file)]:problem}},site),stateFile);});
}
module.exports={preferencesFile,parseProblem,readPreferences,updatePreferences,languageType,languageFor,fileKey,defaultFor,sequenceName,withStateLock,clearDefaults,saveDefault,ojModeFor,selectOj,requireAvailableOj,profileFor,profilePatch,updateOjPreferences};
