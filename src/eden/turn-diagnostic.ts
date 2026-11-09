import type { EdenAction } from '../../shared/eden-assistant.ts';
import type { EdenSurface } from '../../shared/eden-conversation.ts';

type Output='application'|'page-control-result'|'approved-clarification'|'model-text'|'model-approved-facts'|'tool-selection'|'verified-listing'|'unavailable';
type Action=EdenAction['type']|EdenSurface|'identity'|'capabilities'|'search-and-open'|null;
export type EdenTurnDiagnostic={
  correlationId:string;provider:'application'|'gemini'|'undetermined';model:string|null;output:Output;
  proposedAction:Action;outcome:'pending'|'confirmed'|'clarification'|'unavailable'|'cancelled'|'failed';
};
// Safe for the browser inspector, automated checks and a support report. Only
// the latest event lives in memory. No network, storage or visitor text.
let latestId:string|undefined,pendingId:string|undefined;
export function activeEdenTurnCorrelationId(){return pendingId;}
export function clearTurnTrace() {
  latestId=undefined;pendingId=undefined;
  const host=document.getElementById('eden-assistant');
  if(host){delete host.dataset.turnDiagnostic;host.querySelector('[data-eden-diagnostic-view]')?.remove();}
}
export function startTurnTrace() {
  const diagnostic:EdenTurnDiagnostic={correlationId:crypto.randomUUID(),provider:'application',model:null,output:'application',proposedAction:null,outcome:'pending'};
  latestId=diagnostic.correlationId;
  const update=(change:Partial<Omit<EdenTurnDiagnostic,'correlationId'>>)=>{
    Object.assign(diagnostic,change);
    if(latestId!==diagnostic.correlationId)return;
    pendingId=diagnostic.outcome==='pending'?diagnostic.correlationId:undefined;
    const host=document.getElementById('eden-assistant');
    if(host){
      host.dataset.turnDiagnostic=JSON.stringify(diagnostic);
      if(new URLSearchParams(location.search).get('edenDiagnostics')==='1'){
        const settings=host.querySelector('.eden-settings');
        if(settings){
          let view=settings.querySelector<HTMLOutputElement>('[data-eden-diagnostic-view]');
          if(!view){view=document.createElement('output');view.dataset.edenDiagnosticView='';settings.append(view);}
          view.textContent=[diagnostic.provider,diagnostic.model,diagnostic.output,diagnostic.proposedAction,diagnostic.outcome,diagnostic.correlationId].filter(Boolean).join(' · ');
        }
      }
    }
    window.dispatchEvent(new CustomEvent('eden:turn-diagnostic',{detail:{...diagnostic}}));
  };
  const observe=(res:Response)=>{
    const id=res.headers.get('x-eden-correlation-id'),model=res.headers.get('x-eden-text-model');
    if(id!==null&&id!==diagnostic.correlationId)throw Error('Eden could not match this response to the current turn.');
    update({provider:'gemini',model:model&&/^gemini-[a-z0-9.-]{1,64}$/.test(model)?model:null,output:'tool-selection'});
  };
  update({});
  return {diagnostic,update,observe};
}
