'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {firefoxId}=require('./native-install');

function buildFirefoxExtension(target=path.join(__dirname,'.firefox-extension')){
 const source=path.join(__dirname,'extension');
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
 delete manifest.minimum_chrome_version;
 manifest.options_ui={page:manifest.options_page,open_in_tab:true};
 delete manifest.options_page;
 manifest.background={scripts:[
  'qoj.js','qoj-page.js','qoj-worker.js','problem.js','dashboard.js','standings.js','worker.js'
 ]};
 manifest.browser_specific_settings={gecko:{id:firefoxId,strict_min_version:'128.0'}};
 fs.cpSync(source,target,{recursive:true,filter:file=>path.basename(file)!=='manifest.json'});
 const manifestFile=path.join(target,'manifest.json');
 fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n','utf8');
 return manifestFile;
}

if(require.main===module)console.log(buildFirefoxExtension());
module.exports={buildFirefoxExtension};
