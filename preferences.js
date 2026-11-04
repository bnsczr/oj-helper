
'use strict';
const fs=require('node:fs'),path=require('node:path');
const preferencesFile=path.join(__dirname,'.submit-preferences.json');
function parseProblem(value){
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
function languageFor(file,state){
 const type=languageType(file);
 return state.languages?.[type]||{cpp:'GNU G++23',c:'C',python:'Python',java:'Java',rust:'Rust'}[type];
}
function fileKey(file){const absolute=path.resolve(file);return process.platform==='win32'?absolute.toLowerCase():absolute;}
function defaultFor(file,state){return state.fileProblems?.[fileKey(file)]||state.defaultProblem;}
function sequenceName(index){let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name+'.cpp';}
async function withStateLock(file,operation){
 const lock=file+'.lock';let handle;
 for(let attempt=0;attempt<100;attempt++){
  try{handle=await fs.promises.open(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(resolve=>setTimeout(resolve,50));}
 }
 if(!handle)throw Error('题号记录正在更新，请稍后重试。');
 try{return await operation();}finally{await handle.close();await fs.promises.unlink(lock);}
}
async function clearDefaults(file=preferencesFile){return withStateLock(file,()=>updatePreferences({defaultProblem:null,fileProblems:{},assignments:{},lastAddition:null},file));}
async function saveDefault(file,problem,stateFile=preferencesFile){
 parseProblem(problem);
 return withStateLock(stateFile,()=>{const state=readPreferences(stateFile);return updatePreferences({defaultProblem:problem,fileProblems:{...state.fileProblems,[fileKey(file)]:problem}},stateFile);});
}
module.exports={preferencesFile,parseProblem,readPreferences,updatePreferences,languageType,languageFor,fileKey,defaultFor,sequenceName,withStateLock,clearDefaults,saveDefault};
