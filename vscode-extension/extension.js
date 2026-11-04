'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
function problemName(value){
 const m=/^([1-9]\d*)([a-z]\d*)(?:\.cpp)?$/i.exec(value.trim());
 if(!m)throw Error('请输入完整题号，例如 1A、2278F 或 123B1（也可带 .cpp）。');
 return m[1]+m[2].toUpperCase()+'.cpp';
}
function createCommands(vscode,io=fs){
 const settings=()=>vscode.commands.executeCommand('workbench.action.openSettings','codeforcesHelper.directory');
 let busy=false;
 async function newProblem(){
  if(busy)return;busy=true;
  try{
   const directory=vscode.workspace.getConfiguration('codeforcesHelper').get('directory');
   if(typeof directory!=='string'||!directory.trim()){
    const action=await vscode.window.showWarningMessage('尚未设置题目文件保存目录，请先在 oj-helper 设置中填写目录。','打开设置');
    if(action==='打开设置')await settings();return;
   }
   if(!path.isAbsolute(directory))throw Error('保存目录必须是绝对路径，例如 E:\\code\\CF。请修改 oj-helper 设置。');
   let info;try{info=await io.stat(directory);}catch(e){if(e.code==='ENOENT')throw Error('设置的保存目录不存在，请先创建目录或修改设置。');throw e;}
   if(!info.isDirectory())throw Error('设置的保存路径不是文件夹，请修改 oj-helper 设置。');
   const input=await vscode.window.showInputBox({title:'新建 Codeforces 题目文件',prompt:'输入题号，将创建 题号.cpp',placeHolder:'例如 2278F',validateInput:value=>{try{problemName(value);return null;}catch(e){return e.message;}}});
   if(input===undefined)return;
   const name=problemName(input),target=path.join(directory,name);let existed=false;
   try{const file=await io.open(target,'wx');await file.close();}
   catch(e){if(e.code!=='EEXIST')throw e;existed=true;if(!(await io.stat(target)).isFile())throw Error('同名路径已存在，但不是普通文件。');}
   const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(target));
   await vscode.window.showTextDocument(doc,{preview:false});
   if(existed)await vscode.window.showInformationMessage(`${name} 已存在，已打开原文件。`);
  }catch(e){await vscode.window.showErrorMessage('新建题目文件失败：'+e.message);}
  finally{busy=false;}
 }
 return {newProblem,settings};
}
function activate(context){
 const vscode=require('vscode');const commands=createCommands(vscode);
 context.subscriptions.push(
  vscode.commands.registerCommand('codeforcesHelper.newProblem',commands.newProblem),
  vscode.commands.registerCommand('codeforcesHelper.settings',commands.settings),
  vscode.window.registerTreeDataProvider('codeforcesHelper.files',{getTreeItem:item=>item,getChildren:()=>[]})
 );
}
module.exports={activate,createCommands,problemName};
