type RecognitionResult = {isFinal:boolean; 0:{transcript:string}};
type Recognition = {
  processLocally:boolean; lang:string; continuous:boolean; interimResults:boolean;
  start():void; abort():void;
  onresult:((event:{resultIndex:number;results:ArrayLike<RecognitionResult>})=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
};
type LocalRecognizer = {
  new():Recognition;
  available?(options:{langs:string[];processLocally:true}):Promise<string>;
  install?(options:{langs:string[];processLocally:true}):Promise<boolean>;
};
function recognizer():LocalRecognizer|undefined {
  const browser=window as unknown as {SpeechRecognition?:LocalRecognizer;webkitSpeechRecognition?:LocalRecognizer};
  return browser.SpeechRecognition??browser.webkitSpeechRecognition;
}
/** Never start recognition unless the browser supports and guarantees local processing. */
export async function prepareLocalRecognition() {
  // Check an existing denial before offering the optional language download.
  const permission=await navigator.permissions?.query({name:'microphone' as PermissionName}).catch(()=>null);
  if(permission?.state==='denied')throw Error('Microphone access was denied. You can still type to Eden.');
  const ctor=recognizer();
  if(!ctor?.available || !('processLocally' in new ctor()))throw Error('This browser cannot recognize speech on this device. You can type your request.');
  const options={langs:['en-US'],processLocally:true as const};
  let availability=await ctor.available(options);
  if(availability==='downloadable' && ctor.install && await ctor.install(options)) availability=await ctor.available(options);
  if(availability!=='available')throw Error('On-device English recognition is unavailable. You can type your request.');
  return ctor;
}
export function hearOneCommand(ctor:LocalRecognizer,signal:AbortSignal):Promise<string> {
  return new Promise((resolve,reject)=>{
    const rec=new ctor();rec.lang='en-US';rec.processLocally=true;rec.continuous=false;rec.interimResults=false;
    if(!rec.processLocally){reject(Error('Local voice processing is unavailable.'));return;}
    let finished=false;
    function finish(text?:string,error?:Error){
      if(finished)return;finished=true;signal.removeEventListener('abort',abort);
      rec.onend=rec.onerror=rec.onresult=null;
      try{rec.abort();}catch{/* No active microphone. */}
      if(error)reject(error);else resolve(text??'');
    }
    function abort(){finish(undefined,new DOMException('Voice ended','AbortError'));}
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    rec.onresult=event=>{for(let n=event.resultIndex;n<event.results.length;n++){if(event.results[n].isFinal){finish(event.results[n][0].transcript);return;}}};
    rec.onerror=e=>e.error==='no-speech'?finish():finish(undefined,Error(e.error==='not-allowed'||e.error==='service-not-allowed'?'Microphone access was denied. You can still type to Eden.':'On-device recognition stopped. You can type your request.'));
    rec.onend=()=>finish();
    try{rec.start();}catch{finish(undefined,Error('The microphone could not start. You can still type your request.'));}
  });
}
export function localEnglishVoice(){
  return window.speechSynthesis?.getVoices().find(v=>v.localService && /^en(?:-|$)/i.test(v.lang));
}
export async function speakLocalReply(text:string,signal:AbortSignal,onStart:()=>void) {
  const synthesis=window.speechSynthesis;
  const voice=localEnglishVoice();
  if(!voice)throw Error('Audio output is unavailable. Eden’s answer is shown in the chat.');
  await new Promise<void>((resolve,reject)=>{
    const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.onstart=onStart;
    const stop=()=>{synthesis.cancel();reject(new DOMException('Voice ended','AbortError'));};
    const cleanup=()=>signal.removeEventListener('abort',stop);
    if(signal.aborted){stop();return;}signal.addEventListener('abort',stop,{once:true});
    utterance.onend=()=>{cleanup();resolve();};utterance.onerror=()=>{cleanup();reject(Error('Voice output stopped. Eden’s answer is shown in the chat.'));};
    synthesis.speak(utterance);
  });
}
