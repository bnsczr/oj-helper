function normalizeOpenSettings(value){
 const defaults={dashboardCpp:true,dashboardStatement:true,problemCpp:true,problemStatement:false,contestCpp:false};
 return Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,typeof value?.[key]==='boolean'?value[key]:fallback]));
}
function autoOpenSummary(data){
 let text='';
 if(data.openedFiles?.length)text+='\n已请求 VS Code 打开：'+data.openedFiles.map(file=>file.split(/[\\/]/).at(-1)).join('、');
 if(data.warnings?.length)text+='\n'+data.warnings.join('\n');
 return text;
}
if(typeof module!=='undefined')module.exports={normalizeOpenSettings,autoOpenSummary};
