export class RequestInputError extends Error {
 status:number;code:string;
 constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}
/** Stop reading before allocating an unbounded request body, including chunked input. */
export async function boundedJsonObject(request:Request,requireJson=true,timeoutMs=5000):Promise<Record<string,unknown>>{
 if(requireJson&&!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))throw new RequestInputError(415,'CONTENT_TYPE','Use JSON for this action.');
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>16384))throw new RequestInputError(413,'BODY_TOO_LARGE','The request body is too large.');
 const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMs)]);
 let abort:()=>void=()=>{};const stopped=new Promise<never>((_resolve,reject)=>{abort=()=>{void reader?.cancel().catch(()=>{});reject(new RequestInputError(408,'REQUEST_TIMEOUT','The request body took too long. Please try again.'));};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 if(reader){try{while(true){const next=await Promise.race([reader.read(),stopped]);if(signal.aborted)throw new RequestInputError(408,'REQUEST_TIMEOUT','The request body took too long. Please try again.');if(next.done)break;bytes+=next.value.byteLength;if(bytes>16384){void reader.cancel().catch(()=>{});throw new RequestInputError(413,'BODY_TOO_LARGE','The request body is too large.');}chunks.push(next.value);}}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}}
 if(!reader){signal.removeEventListener('abort',abort);void stopped.catch(()=>{});}
 const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
 let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}catch{throw new RequestInputError(400,'MALFORMED_JSON','Expected valid JSON.');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new RequestInputError(422,'VALIDATION_ERROR','Expected a JSON object.');
 return value as Record<string,unknown>;
}
