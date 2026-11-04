const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readStatement}=require('./extension/statement');
function element(tag,children=[],classes=[],attrs={}){
 const node={nodeName:tag,nodeType:1,childNodes:children.map(value=>typeof value==='string'?{nodeType:3,nodeValue:value}:value),classList:{contains:value=>classes.includes(value)},getAttribute:key=>attrs[key]};
 Object.defineProperty(node,'textContent',{get:()=>node.childNodes.map(child=>child.nodeType===3?child.nodeValue:child.textContent).join('')});
 return node;
}
test('题面 Markdown 保留段落、数学公式、图片及全部样例，过滤复制按钮和重复渲染公式',()=>{
 const title=element('DIV',['A. A test'],['title']);
 const pre=lines=>element('PRE',lines.map(line=>element('DIV',[line])));
 const statement=element('DIV',[
  element('DIV',[title,element('DIV',['time limit per test'],['property-title']),'2 seconds'],['header']),
  element('P',['Compute ',element('SPAN',['duplicate preview'],['MathJax_Preview']),element('SCRIPT',['a_i + b'],[],{type:'math/tex'}),element('SPAN',['duplicate math'],['MathJax']),' now.']),
  element('DIV',['Input'],['section-title']),element('P',['Two integers.']),
  element('IMG',[],[],{src:'/images/test.png',alt:'diagram'}),
  element('A',['Explanation'],[],{href:'/contest/2278'}),
  element('DIV',[
   element('DIV',[element('DIV',['Input'],['title']),pre(['1','','2']),element('DIV',['Copy'],['input-output-copier'])],['input']),
   element('DIV',[element('DIV',['Output'],['title']),pre(['3'])],['output']),
   element('DIV',[element('DIV',['Input'],['title']),pre(['4'])],['input']),
   element('DIV',[element('DIV',['Output'],['title']),pre(['5'])],['output'])
  ],['sample-test']),element('P',['Note: ',element('STRONG',['important'])])
 ],['problem-statement']);
 statement.querySelector=selector=>selector==='.problem-statement'?null:title;
 const url='https://codeforces.com/contest/2278/problem/A';
 // This is the same self-contained function that Chrome serializes into a tab.
 const fn=vm.runInNewContext('('+readStatement.toString()+')',{URL});const result=fn(statement,url);
 assert.match(result,/# A\. A test/);assert.match(result,/\$a_i \+ b\$/);assert.match(result,/## Input/);
 assert.match(result,/!\[diagram\]\(https:\/\/codeforces.com\/images\/test.png\)/);
 assert.match(result,/\[Explanation\]\(https:\/\/codeforces.com\/contest\/2278\)/);
 assert.match(result,/```text\n1\n\n2\n```/);assert.match(result,/```text\n3\n```/);assert.match(result,/```text\n4\n```/);assert.match(result,/```text\n5\n```/);
 assert.match(result,/\*\*important\*\*/);assert.doesNotMatch(result,/Copy|duplicate/);
 assert.equal(result.split('# A. A test').length-1,1);
});
