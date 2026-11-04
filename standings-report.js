'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function validateStandings(snapshot,addition){
 const s=snapshot;
 if(!s||s.kind!=='friends-standings'||s.contest!==addition.contest||s.section!==(addition.section||'contest')||!Array.isArray(s.headers)||!s.headers.length||!s.headers.every(cell=>typeof cell==='string')||!Array.isArray(s.rows)||!s.rows.every(row=>Array.isArray(row)&&row.every(cell=>typeof cell==='string')))throw Error('好友榜单数据不完整，请更新扩展后重新运行 open b。');
 let url;try{url=new URL(s.url);}catch{throw Error('好友榜单网址无效。');}
 const expected='/'+s.section+'/'+s.contest+'/standings/friends/true';
 if(url.protocol!=='https:'||!['codeforces.com','www.codeforces.com'].includes(url.hostname)||url.port||url.username||url.password||(url.pathname!==expected&&url.pathname!==expected+'/'&&!url.pathname.startsWith(expected+'/page/')))throw Error('返回的不是本场比赛的好友榜单，未保存。');
}
function renderStandings(snapshot){
 const escape=value=>String(value||'').replace(/\\/g,'\\\\').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/([*_`\[\]])/g,'\\$1').replace(/\r\n?|\n/g,'<br>');
 const width=Math.max(snapshot.headers.length,...snapshot.rows.map(row=>row.length));
 const row=cells=>'| '+Array.from({length:width},(_,index)=>escape(cells[index])).join(' | ')+' |';
 let markdown='# '+escape(snapshot.title||'Friends standings')+'\n\n';
 markdown+='[Friends standings]('+snapshot.url+')\n\n';
 if(snapshot.description)markdown+=escape(snapshot.description)+'\n\n';
 markdown+='当前账号：'+escape(snapshot.handle||'-')+'  \nShow unofficial：'+(snapshot.showUnofficial?'开启':'关闭')+'  \n读取时间：'+escape(snapshot.capturedAt||'')+'\n\n';
 markdown+=row(snapshot.headers)+'\n'+row(Array(width).fill('---'))+'\n'+snapshot.rows.map(row).join('\n')+'\n';
 if(!snapshot.rows.length)markdown+='\n本页暂无榜单数据。\n';
 const pages=(snapshot.pages||[]).filter(page=>{
  try{const url=new URL(page.url),source=new URL(snapshot.url);return url.origin===source.origin&&url.pathname.startsWith('/'+snapshot.section+'/'+snapshot.contest+'/standings/friends/true');}catch{return false;}
 });
 if(pages.length)markdown+='\n网页分页：'+pages.map(page=>'['+escape(page.label)+']('+page.url+')').join(' · ')+'\n';
 return markdown;
}
async function saveStandings(addition,snapshot){
 validateStandings(snapshot,addition);
 const target=path.join(addition.directory,'standings.md');
 try{if(!(await fs.lstat(target)).isFile())throw Error('standings.md 不是普通文件，无法覆盖。');}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.writeFile(target,renderStandings(snapshot),'utf8');return target;
}
module.exports={validateStandings,renderStandings,saveStandings};
