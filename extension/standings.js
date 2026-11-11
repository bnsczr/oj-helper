var ojBrowser=globalThis.browser??globalThis.chrome;
// Self-contained so Chrome can execute it in the normally opened webpage.
function readStandingsPage(expected){
 const path='/'+expected.section+'/'+expected.contest+'/standings/friends/true';
 if(location.pathname!==path&&location.pathname!==path+'/'&&!location.pathname.startsWith(path+'/page/'))return {waiting:true};
 if(/just a moment|attention required|security verification/i.test(document.title)||document.querySelector('#challenge-running,#challenge-stage'))return {waiting:true,challenge:true};
 const table=document.querySelector('table.standings, .standings table, table#standings');
 if(!table)return {waiting:true};
 const toggle=document.querySelector('input[name="showUnofficial"], #showUnofficial');
 if(toggle&&!!toggle.checked!==expected.showUnofficial)return {toggle:true};
 // Read rendered line breaks without flattening score/time cells.
 function cellText(cell){
  function walk(node){
   if(node.nodeType===3)return node.nodeValue||'';
   if(node.nodeName==='BR')return '\n';
   if(['SCRIPT','STYLE','BUTTON'].includes(node.nodeName))return '';
   const text=Array.from(node.childNodes||[]).map(walk).join('');
   return /^(DIV|P|LI)$/.test(node.nodeName)?'\n'+text+'\n':text;
  }
  return (typeof cell.innerText==='string'?cell.innerText:walk(cell)).replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim();
 }
 const sourceRows=Array.from(table.rows||table.querySelectorAll('tr')).filter(row=>!row.closest||row.closest('table')===table);
 if(!sourceRows.length)return {waiting:true};
 const grid=[],headerRows=[];
 for(let r=0;r<sourceRows.length;r++){
  const row=sourceRows[r];grid[r]||=[];let column=0;
  const cells=Array.from(row.cells||[]);
  if(r===headerRows.length&&(row.parentElement?.nodeName==='THEAD'||cells.some(cell=>cell.nodeName==='TH')))headerRows.push(r);
  for(const cell of cells){
   while(grid[r][column]!==undefined)column++;
   const rows=Math.max(1,cell.rowSpan||1),cols=Math.max(1,cell.colSpan||1),value=cellText(cell);
   for(let rr=r;rr<r+rows;rr++){
    grid[rr]||=[];
    for(let cc=column;cc<column+cols;cc++)grid[rr][cc]=rr===r&&cc===column?value:'';
   }
   column+=cols;
  }
 }
 if(!headerRows.length)headerRows.push(0);
 const width=Math.max(...grid.map(row=>row.length));
 if(!width)return {waiting:true};
 const headers=Array.from({length:width},(_,column)=>headerRows.map(index=>grid[index][column]||'').filter(Boolean).join('\n'));
 const rows=grid.filter((_,index)=>!headerRows.includes(index)).map(row=>Array.from({length:width},(_,column)=>row[column]||''));
 let handle=null;const account=document.querySelector('#header a[href^="/profile/"]');
 try{handle=account?decodeURIComponent(account.getAttribute('href').split('/')[2]):null;}catch{}
 const title=document.querySelector('#pageContent .contest-name, #pageContent h1, #pageContent h2, .standings-name');
 const description=document.querySelector('.standings-status, .contest-status, .contest-state-phase');
 const pages=Array.from(document.querySelectorAll('.pagination a[href], .page-index a[href]')).map(link=>{
  const url=new URL(link.getAttribute('href'),location.href);
  return url.origin===location.origin&&url.pathname.startsWith(path)?{label:(link.textContent||'').trim(),url:url.href}:null;
 }).filter(Boolean);
 return {snapshot:{kind:'friends-standings',contest:expected.contest,section:expected.section,url:location.href,title:(title?.textContent||document.title).trim(),description:description?.textContent.trim()||'',handle,showUnofficial:expected.showUnofficial,headers,rows,pages,capturedAt:new Date().toISOString()}};
}
function setStandingsUnofficial(){
 const toggle=document.querySelector('input[name="showUnofficial"], #showUnofficial');
 if(!toggle)return false;toggle.click();return true;
}
async function openStandingsTab(task){
 const settings=await ojBrowser.storage.local.get('standingsShowUnofficial');
 const showUnofficial=settings.standingsShowUnofficial!==false;
 const url=`https://codeforces.com/${task.section}/${task.contest}/standings/friends/true?showUnofficial=${showUnofficial}`;
 const tab=await ojBrowser.tabs.create({active:true,url});
 let toggled=false,settling=0;
 for(let attempt=0;attempt<120;attempt++){
  const current=await ojBrowser.tabs.get(tab.id);
  if(current.status==='complete'){
   let replies;
   try{replies=await ojBrowser.scripting.executeScript({target:{tabId:tab.id},func:readStandingsPage,args:[{contest:task.contest,section:task.section,showUnofficial}]});}
   catch{await new Promise(resolve=>setTimeout(resolve,1000));continue;}
   const page=replies[0]?.result;
   if(page?.toggle){
    if(!toggled){toggled=true;await ojBrowser.scripting.executeScript({target:{tabId:tab.id},func:setStandingsUnofficial});settling=attempt+3;}
    else if(attempt>settling)throw Error('未能切换 Show unofficial，请在好友榜单页面核对。');
   }else if(page?.snapshot&&(!toggled||attempt>settling))return page.snapshot;
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw Error('读取好友榜单超时，请检查网页登录、验证或访问权限；已有榜单文件未覆盖。');
}
if(typeof module!=='undefined')module.exports={readStandingsPage,setStandingsUnofficial,openStandingsTab};
