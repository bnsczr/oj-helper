'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {firefoxId}=require('./native-install');

function buildFirefoxExtension(target=path.join(__dirname,'.firefox-extension'),{release=false}={}){
 const source=path.join(__dirname,'extension');
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
 delete manifest.minimum_chrome_version;
 manifest.options_ui={page:manifest.options_page,open_in_tab:true};
 delete manifest.options_page;
 manifest.background={scripts:[
  'qoj.js','qoj-page.js','qoj-worker.js','problem.js','dashboard.js','standings.js','worker.js'
 ]};
 manifest.browser_specific_settings={gecko:{id:firefoxId,strict_min_version:'128.0'}};
 if(release){
  // Release builds use Firefox's install-time consent for communication with the local helper.
  const gecko=manifest.browser_specific_settings.gecko;
  gecko.strict_min_version='140.0';
  gecko.data_collection_permissions={required:['authenticationInfo','browsingActivity','websiteActivity','websiteContent']};
  manifest.incognito='not_allowed';
  manifest.description='Import Codeforces and QOJ problems into your local workspace, submit code, and view results.';
 }
 fs.cpSync(source,target,{recursive:true,filter:file=>path.basename(file)!=='manifest.json'});
 const manifestFile=path.join(target,'manifest.json');
 fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n','utf8');
 return manifestFile;
}

if(require.main===module){
 const release=process.argv.includes('--release');
 const target=release?path.join(__dirname,'.firefox-release'):undefined;
 console.log(buildFirefoxExtension(target,{release}));
}
module.exports={buildFirefoxExtension};
