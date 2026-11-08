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

/** Never fall back to browser/server recognition. Check again after async setup
 * so a canceled permission prompt or language installation cannot start the mic. */
export async function prepareLocalRecognition(signal?:AbortSignal,onDownload?:()=>void) {
  const permission=await navigator.permissions?.query({name:'microphone' as PermissionName}).catch(()=>null);
  signal?.throwIfAborted();
  if(permission?.state==='denied')throw Error('Microphone access was denied. You can still type to Eden.');
  const ctor=recognizer();
  if(!ctor?.available || !('processLocally' in new ctor()))throw Error('This browser cannot recognize speech on this device. You can type your request.');
  const options={langs:['en-US'],processLocally:true as const};
  let availability=await ctor.available(options);
  signal?.throwIfAborted();
  if(availability==='downloadable' && ctor.install){
    onDownload?.();
    if(await ctor.install(options))availability=await ctor.available(options);
  }
  signal?.throwIfAborted();
  if(availability!=='available')throw Error('On-device English recognition is unavailable. You can type your request.');
  return ctor;
}

/** One user-initiated utterance. Interim text is feedback, never a submitted turn. */
export function hearOneCommand(ctor:LocalRecognizer,signal:AbortSignal,onInterim?:(text:string)=>void):Promise<string> {
  return new Promise((resolve,reject)=>{
    const rec=new ctor();rec.lang='en-US';rec.processLocally=true;rec.continuous=false;rec.interimResults=true;
    if(!rec.processLocally){reject(Error('Local voice processing is unavailable.'));return;}
    let finished=false;
    const timer=setTimeout(()=>finish(),30_000);
    function finish(text?:string,error?:Error){
      if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);
      rec.onend=rec.onerror=rec.onresult=null;
      try{rec.abort();}catch{/* Browser already released the microphone. */}
      if(error)reject(error);else resolve(text?.trim()??'');
    }
    function abort(){finish(undefined,new DOMException('Voice ended','AbortError'));}
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    rec.onresult=event=>{
      const results=Array.from(event.results);
      const final=results.filter(r=>r.isFinal).map(r=>r[0].transcript.trim()).join(' ');
      if(final){finish(final);return;}
      onInterim?.(results.map(r=>r[0].transcript.trim()).join(' ').slice(0,240));
    };
    rec.onerror=e=>e.error==='no-speech'?finish():finish(undefined,Error(e.error==='not-allowed'||e.error==='service-not-allowed'?'Microphone access was denied. You can still type to Eden.':'On-device recognition stopped. You can type your request.'));
    rec.onend=()=>finish();
    try{rec.start();}catch{finish(undefined,Error('The microphone could not start. You can still type your request.'));}
  });
}

export function localEnglishVoices(): SpeechSynthesisVoice[] {
  const voices=(window.speechSynthesis?.getVoices()??[]).filter(v=>v.localService && /^en(?:-|$)/i.test(v.lang));
  // Prefer an enhanced installed voice, then the browser's preferred English voice.
  const quality=(v:SpeechSynthesisVoice)=>Number(/enhanced|premium|natural/i.test(v.name))*4+Number(v.default)*2+Number(/^en-US$/i.test(v.lang));
  return voices.sort((a,b)=>quality(b)-quality(a)||a.name.localeCompare(b.name));
}
export function localEnglishVoice(preference?:string){
  const voices=localEnglishVoices();
  return voices.find(v=>v.voiceURI===preference)??voices[0];
}
export async function speakLocalReply(text:string,signal:AbortSignal,onStart:()=>void,preferred?:string) {
  signal.throwIfAborted();
  const synthesis=window.speechSynthesis, voice=localEnglishVoice(preferred);
  if(!voice)throw Error('No English device voice is available. Eden’s answer is shown in the chat.');
  await new Promise<void>((resolve,reject)=>{
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=1;utterance.pitch=1;
    const startTimer=setTimeout(()=>{
      finish(Error('Voice playback did not start. You can read Eden’s answer in the chat.'));
      synthesis.cancel();
    },8000);
    const finish=(error?:Error)=>{
      clearTimeout(startTimer);signal.removeEventListener('abort',stop);
      utterance.onstart=utterance.onend=utterance.onerror=null;
      if(error)reject(error);else resolve();
    };
    const stop=()=>{finish(new DOMException('Voice ended','AbortError'));synthesis.cancel();};
    signal.addEventListener('abort',stop,{once:true});
    utterance.onstart=()=>{clearTimeout(startTimer);if(!signal.aborted)onStart();};
    utterance.onend=()=>finish();utterance.onerror=()=>finish(Error('Voice output stopped. Eden’s answer is shown in the chat.'));
    try{synthesis.speak(utterance);}catch{finish(Error('Voice output could not start. You can read Eden’s answer in the chat.'));}
  });
}
