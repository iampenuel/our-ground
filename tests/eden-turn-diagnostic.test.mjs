import test from 'node:test';
import assert from 'node:assert/strict';
import {startTurnTrace,clearTurnTrace,activeEdenTurnCorrelationId} from '../src/eden/turn-diagnostic.ts';

// The diagnostic has no permissions, storage, network, prompts or DOM text.
test('a turn exposes only bounded provenance; stale, mismatched and cleared turns cannot replace the current diagnostic',()=>{
  const host={dataset:{},querySelector(){return null;}},events=[];
  const saved={document:globalThis.document,window:globalThis.window,location:globalThis.location};
  globalThis.document={getElementById:()=>host};globalThis.window=new EventTarget();globalThis.location={search:''};
  window.addEventListener('eden:turn-diagnostic',event=>events.push(event.detail));
  try{
    const first=startTurnTrace();
    const second=startTurnTrace();
    assert.equal(activeEdenTurnCorrelationId(),second.diagnostic.correlationId);
    first.update({outcome:'failed'});
    assert.equal(JSON.parse(host.dataset.turnDiagnostic).correlationId,second.diagnostic.correlationId);
    const headers={'x-eden-correlation-id':second.diagnostic.correlationId,'x-eden-text-model':'gemini-3.5-flash-lite'};
    second.observe(new Response(null,{headers}));
    second.update({proposedAction:'identity',output:'model-approved-facts',outcome:'confirmed'});
    assert.equal(activeEdenTurnCorrelationId(),undefined);
    const result=JSON.parse(host.dataset.turnDiagnostic);
    assert.deepEqual(Object.keys(result).sort(),['correlationId','provider','model','output','proposedAction','outcome'].sort());
    assert.equal(result.provider,'gemini');assert.equal(result.model,'gemini-3.5-flash-lite');
    assert.throws(()=>second.observe(new Response(null,{headers:{...headers,'x-eden-correlation-id':first.diagnostic.correlationId}})),/could not match/);
    clearTurnTrace();first.update({outcome:'failed'});assert(!host.dataset.turnDiagnostic);
    assert(events.every(item=>Object.keys(item).every(key=>Object.keys(result).includes(key))));
  }finally{
    for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
});
