using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
class NativeLauncher {
 static byte[] ReadExact(Stream input,int length) {
  var result=new byte[length];int offset=0;
  while(offset<length){int count=input.Read(result,offset,length-offset);if(count==0)throw new EndOfStreamException();offset+=count;}
  return result;
 }
 [STAThread] static int Main() {
  try {
   var directory=AppDomain.CurrentDomain.BaseDirectory;
   var node=File.ReadAllText(Path.Combine(directory,"node-path.txt")).Trim();
   var script=Path.GetFullPath(Path.Combine(directory,"..","native-host.js"));
   var start=new ProcessStartInfo(node,"\""+script+"\"");
   start.UseShellExecute=false; start.CreateNoWindow=true;
   start.RedirectStandardInput=true; start.RedirectStandardOutput=true;
   start.RedirectStandardError=true;
   using(var child=Process.Start(start)) {
    child.ErrorDataReceived+=(s,e)=>{}; child.BeginErrorReadLine();
    var input=Console.OpenStandardInput();
    var header=ReadExact(input,4);int length=BitConverter.ToInt32(header,0);
    if(length<0||length>1048576){child.Kill();return 1;}
    var payload=ReadExact(input,length);
    child.StandardInput.BaseStream.Write(header,0,header.Length);
    child.StandardInput.BaseStream.Write(payload,0,payload.Length);
    child.StandardInput.BaseStream.Flush();
    // Keep a connectNative port alive without delaying one-shot replies.
    var forward=new Thread(()=>{
     try {input.CopyTo(child.StandardInput.BaseStream);child.StandardInput.BaseStream.Flush();}
     catch {}
     finally {try {child.StandardInput.Close();}catch {}}
    });
    forward.IsBackground=true;forward.Start();
    try {
     var output=Console.OpenStandardOutput();child.StandardOutput.BaseStream.CopyTo(output);output.Flush();
     child.WaitForExit();return child.ExitCode;
    } finally {try {if(!child.HasExited)child.Kill();}catch {}}
   }
  } catch {return 1;}
 }
}
