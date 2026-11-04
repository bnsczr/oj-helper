const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createCommands,problemName}=require('./vscode-extension/extension');
test('题号转换及路径输入拒绝',()=>{
 assert.equal(problemName(' 2278f '),'2278F.cpp');assert.equal(problemName('123b1.cpp'),'123B1.cpp');
 for(const input of ['../1A','1A/xx','1A.cpp.cpp','A','0A','1A;foo'])assert.throws(()=>problemName(input));
});
function fake(directory,input,action){
 const events=[];const api={commands:{executeCommand:async(...args)=>events.push(['settings',...args])},Uri:{file:p=>p},workspace:{getConfiguration:()=>({get:()=>directory}),openTextDocument:async p=>{events.push(['open',p]);return p;}},window:{showWarningMessage:async s=>{events.push(['warn',s]);return action;},showErrorMessage:async s=>events.push(['error',s]),showInformationMessage:async s=>events.push(['info',s]),showInputBox:async()=>{events.push(['input']);return input;},showTextDocument:async p=>events.push(['show',p])}};return {api,events};
}
test('未配置目录先提示并打开设置，不创建文件',async()=>{
 const {api,events}=fake(undefined,'1A','打开设置');await createCommands(api,{stat:()=>assert.fail('不可访问目录'),open:()=>assert.fail('不可写文件')}).newProblem();
 assert.deepEqual(events.map(e=>e[0]),['warn','settings']);
});
test('创建到指定目录、打开文件、同名不覆盖、取消不创建',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cf-new-'));
 try{
  const {api,events}=fake(dir,'2278f');await createCommands(api).newProblem();const target=path.join(dir,'2278F.cpp');assert.equal(await fs.readFile(target,'utf8'),'');assert.ok(events.some(e=>e[0]==='show'&&e[1]===target));
  await fs.writeFile(target,'int main(){}');await createCommands(api).newProblem();assert.equal(await fs.readFile(target,'utf8'),'int main(){}');assert.ok(events.some(e=>e[0]==='info'));
  await createCommands(fake(dir,undefined).api).newProblem();assert.deepEqual(await fs.readdir(dir),['2278F.cpp']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('无效目录报告错误',async()=>{for(const dir of ['relative-path',path.join(os.tmpdir(),'cf-missing-'+Date.now())]){const {api,events}=fake(dir,'1A');await createCommands(api).newProblem();assert.ok(events.some(e=>e[0]==='error'));assert.ok(!events.some(e=>e[0]==='input'));}});
