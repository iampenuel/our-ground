import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

async function writeRecording(context,frames,output){
  // Encoding happens after the run. All source pixels and timestamps are from
  // the CDP screencast. The encoder neither renders nor controls the application.
  const page=await context.newPage();
  const data=await page.evaluate(async frames=>{
    async function decode(frame){const img=new Image();img.src='data:image/jpeg;base64,'+frame.data;await img.decode();return img;}
    const opening=await decode(frames[0]),canvas=document.createElement('canvas');canvas.width=opening.width;canvas.height=opening.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(opening,0,0);opening.src='';const stream=canvas.captureStream(20);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1800000}),parts=[];
    const final=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder.onstop=()=>resolve(new Blob(parts,{type:recorder.mimeType}));});
    recorder.start();const start=performance.now(),first=frames[0].t;
    for(let i=1;i<frames.length;i++){
      const img=await decode(frames[i]);
      const wait=(frames[i].t-first)*1000-(performance.now()-start);if(wait>0)await new Promise(r=>setTimeout(r,wait));
      ctx.drawImage(img,0,0);img.src='';
    }
    await new Promise(r=>setTimeout(r,120));recorder.stop();
    const blob=await final;stream.getTracks().forEach(track=>track.stop());
    return await new Promise(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result.split(',')[1]);fr.readAsDataURL(blob);});
  },frames);
  await writeFile(output,Buffer.from(data,'base64'));await page.close();
}

/** Capture unaltered Chrome browser pixels from the actual run. Save stops
 * capture before encoding; the blank encoder page never touches the source. */
export async function recordBrowser(page,{width=960,height=640}={}){
  const cdp=await page.context().newCDPSession(page),frames=[];
  cdp.on('Page.screencastFrame',f=>{
    if(frames.length<2400)frames.push({data:f.data,t:f.metadata.timestamp});
    void cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:78,maxWidth:width,maxHeight:height,everyNthFrame:3});
  return {
    async save(output){
      await cdp.send('Page.stopScreencast');await cdp.detach();
      if(frames.length<2)throw Error('No timed browser frames were captured.');
      await mkdir(dirname(output),{recursive:true});
      await writeRecording(page.context(),frames,output);
      return {frames:frames.length,seconds:+(frames.at(-1).t-frames[0].t).toFixed(2)};
    }
  };
}
