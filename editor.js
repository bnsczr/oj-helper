'use strict';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const discoveryScript=`$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$candidates=@()
$candidates+=@(Get-Process Code -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -ErrorAction SilentlyContinue)
$candidates+=@(Get-Command code.cmd,code -CommandType Application -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
$candidates+=$env:VSCODE_GIT_ASKPASS_NODE
foreach($key in @('Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe','Registry::HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe','Registry::HKEY_CURRENT_USER\\Software\\Classes\\Applications\\Code.exe\\shell\\open\\command','Registry::HKEY_CLASSES_ROOT\\Applications\\Code.exe\\shell\\open\\command')){
 $entry=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
 if($entry){$candidates+=$entry.'(default)'}
}
foreach($base in @($env:LOCALAPPDATA,$env:ProgramFiles,([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')))){
 if($base){$candidates+=(Join-Path $base 'Programs\\Microsoft VS Code');$candidates+=(Join-Path $base 'Microsoft VS Code')}
}
foreach($candidate in @($candidates | Where-Object {$_} | Select-Object -Unique)){
 $candidate=[Environment]::ExpandEnvironmentVariables($candidate)
 if($candidate -match '^"([^"\r\n]+)"'){$candidate=$Matches[1]}
 elseif($candidate -match '^(.*?Code\\.exe)(?:\\s|$)'){$candidate=$Matches[1]}
 $base=$candidate
 if([IO.Path]::GetExtension($candidate) -eq '.cmd'){$base=Split-Path (Split-Path $candidate -Parent) -Parent}
 elseif([IO.Path]::GetExtension($candidate) -eq '.exe'){$base=Split-Path $candidate -Parent}
 foreach($directory in @($base,(Join-Path $base '_'))){
  $exe=Join-Path $directory 'Code.exe';$cli=Join-Path $directory 'resources\\app\\out\\cli.js'
  if((Test-Path -LiteralPath $exe -PathType Leaf) -and (Test-Path -LiteralPath $cli -PathType Leaf)){
   @{exe=$exe;cli=$cli} | ConvertTo-Json -Compress
   exit 0
  }
 }
}
'{}'`;
async function findWindowsVSCode({run=promisify(execFile)}={}){
 const args=['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(discoveryScript,'utf16le').toString('base64')];
 const {stdout}=await run('powershell.exe',args,{windowsHide:true,encoding:'utf8',timeout:10000});
 const found=JSON.parse(stdout.trim().replace(/^\uFEFF/,''));
 if(!found.exe||!found.cli)throw Error('未找到 VS Code 的安装位置，请先启动 VS Code 后再运行 open s。');
 return found;
}
async function openInVSCode(file,{platform=process.platform,run=promisify(execFile),env=process.env}={}){
 const targets=[...new Set((Array.isArray(file)?file:[file]).map(target=>path.resolve(target)))];
 if(!targets.length)return;
 const directory=path.dirname(targets[0]);
 // Open the saved folder as the workspace, so new terminals use that folder.
 const args=['--reuse-window','--',directory,...targets];
 const options={cwd:directory,windowsHide:true,encoding:'utf8',timeout:15000,env:{...env,VSCODE_CWD:directory}};
 try{
  if(platform==='win32'){
   const editor=await findWindowsVSCode({run});
   // Use the actual installation's CLI, including portable/custom installs.
   // No shell handles the filename, so special characters remain literal.
   await run(editor.exe,[editor.cli,...args],{...options,env:{...options.env,ELECTRON_RUN_AS_NODE:'1',VSCODE_DEV:''}});
  }else await run('code',args,options);
 }catch(error){throw Error('无法打开 VS Code：'+error.message,{cause:error});}
}
module.exports={openInVSCode,findWindowsVSCode};
