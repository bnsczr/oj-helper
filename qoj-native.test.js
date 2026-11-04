const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {encode}=require('./native-host');
const {pdfDocument}=require('./test-support/qoj-fixtures');
test('真实 QOJ 启动器可传输超过 1 MiB 的 PDF，保持输入开启也能返回且不打开编辑器',async t=>{
 const installed=path.join(__dirname,'.native-host','launcher-v5.exe');if(process.platform!=='win32'||!sync.existsSync(installed))return t.skip('未编译 Windows 启动器');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'qoj-native-large-'));
 try{
  const native=path.join(directory,'.native-host');await fs.mkdir(native);const launcher=path.join(native,'launcher.exe');await fs.copyFile(installed,launcher);await fs.writeFile(path.join(native,'node-path.txt'),process.execPath);
  const secretFile=path.join(directory,'secret'),stateFile=path.join(directory,'state.json');await fs.writeFile(secretFile,'paired');
  await fs.writeFile(path.join(directory,'native-host.js'),'require('+JSON.stringify(require.resolve('./native-host'))+').run('+JSON.stringify({secretFile,stateFile})+');');
  const pdf=Buffer.concat([pdfDocument([['Native PDF full statement','Input','Output']]),Buffer.alloc(1200000,32)]);
  const message={action:'qoj-create',secret:'paired',directory,openAfterAdd:{problemCpp:false,problemStatement:false},problem:{url:'https://qoj.ac/problem/123',statement:'# PDF test',samples:[{input:'1',output:'2'}],pdf:{url:'https://qoj.ac/download.php?id=123&type=statement',base64:pdf.toString('base64')}}};
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(launcher,[],{windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks=[];const timer=setTimeout(()=>{child.kill();reject(Error('大附件本机请求超时'));},10000);
   child.stdout.on('data',chunk=>chunks.push(chunk));child.stderr.resume();child.on('error',error=>{clearTimeout(timer);reject(error);});child.stdin.on('error',()=>{});
   child.on('exit',code=>{clearTimeout(timer);try{assert.equal(code,0);const data=Buffer.concat(chunks);assert.equal(data.readUInt32LE(),data.length-4);resolve(JSON.parse(data.subarray(4).toString()));}catch(error){reject(error);}});
   child.stdin.write(encode(message));
  });
  assert.equal(result.error,undefined);assert.equal(result.name,'A.cpp');assert.equal(result.addition,undefined);assert.deepEqual(await fs.readFile(path.join(directory,'statements','QOJ-123.pdf')),pdf);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
