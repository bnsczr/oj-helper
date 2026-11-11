function problemFromUrl(value){
 let url;try{url=new URL(value);}catch{throw Error('当前页面没有可识别的网址。');}
 if(url.protocol!=='https:'||!['codeforces.com','www.codeforces.com'].includes(url.hostname)||url.port||url.username||url.password)throw Error('当前页面不是 Codeforces 题目页。');
 const m=/^\/(?:problemset\/problem\/([1-9]\d*)\/([a-z]\d*)|(?:contest|gym)\/([1-9]\d*)\/problem\/([a-z]\d*))\/?$/i.exec(url.pathname);
 if(!m)throw Error('请先打开某一道 Codeforces 题目的页面；列表、提交页和首页不能新建题目文件。');
 return (m[1]||m[3])+(m[2]||m[4]).toUpperCase()+'.cpp';
}
function dashboardFromUrl(value){
 let url;try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||!['codeforces.com','www.codeforces.com'].includes(url.hostname)||url.port||url.username||url.password)return null;
 const match=/^\/(contest|gym)\/([1-9]\d*)\/?$/.exec(url.pathname);
 return match?{section:match[1],contest:match[2],url:url.origin+'/'+match[1]+'/'+match[2]}:null;
}
if(typeof module!=='undefined')module.exports={problemFromUrl,dashboardFromUrl};
