import test from 'node:test';
import assert from 'node:assert/strict';
import {completed,describeResults,forControls,projectedState,searchFailure} from '../src/support-search-outcome.ts';
import {searchSupport} from '../src/support-search.ts';
const f={location:'Lancaster, PA',category:'food',term:'food_assistance',mode:'real',radius:25,keyword:'bread'};
const read=(o,...args)=>describeResults(o,[],0,0,...args);
test('zero is a completed query tied to its exact filters with a referral, not a statement about community services',()=>{
 const z=read(completed(f,0));assert.equal(z.status,'done');for(const term of ['completed','Lancaster, PA','Food','25 miles','“bread”','no matching listings','may still be available','211','Feeding America','broaden','clear the keyword','Healthcare'])assert(z.message.includes(term));
 const healthcare=read(completed({...f,category:'healthcare',radius:50},0));assert.match(healthcare.message,/HRSA Find a Health Center/);assert.doesNotMatch(healthcare.message,/Feeding America|broaden the radius/);
});
test('directory total is independent from loaded rows and mapped leads',()=>{
 const r=describeResults(completed(f,121),['First','Second'],20,2);assert.match(r.message,/121 matching directory listings; 20 loaded/);assert.match(r.message,/2 mapped leads/);assert.match(r.message,/1\. First/);
 assert.match(read(completed({...f,mode:'demo'},0)).message,/sample listings/);assert.doesNotMatch(read(completed({...f,mode:'demo'},0)).message,/211/);
});
test('unstarted, loading, edited, failed, limited and completed reads remain distinct, including invalid counts',()=>{
 const states=[{phase:'idle'},{filters:f,phase:'loading'},forControls(completed(f,5),{...f,radius:10}),{phase:'failed',filters:f},{phase:'limited',filters:f,retryAt:10000},completed(f,0)];
 assert.deepEqual(states.map(projectedState),['idle','loading','idle','error','error','ready']);assert.equal(new Set(states.map(s=>read(s,2000).message)).size,6);assert.match(read(states[4],2000).message,/in 8 seconds/);assert.equal(read(completed(f,NaN)).status,'unavailable');
 for(const patch of [{category:'healthcare'},{keyword:''},{term:'food_bank'},{radius:5},{mode:'demo'},{location:'Erie'}])assert.equal(forControls(completed(f,0),{...f,...patch}).phase,'edited');
});
test('directory 429 survives the transport, while a failed optional map does not erase a successful empty directory',async()=>{
 const point={label:f.location,latitude:40,longitude:-76};const signal=new AbortController().signal;
 const fail=Object.assign(Error('busy'),{status:429,retryAfterSeconds:12});
 const r=await searchSupport(async()=>{throw fail;},f,false,signal,undefined,point);assert.equal(r.status,'error');assert.equal(r.failure.phase,'limited');assert(r.failure.retryAt>Date.now());assert.equal(searchFailure(Error('failed')).phase,'failed');
 const s=await searchSupport(async path=>{if(path==='resources/search')return{items:[],total:0};throw fail;},f,true,signal,undefined,point);assert.equal(s.status,'results');assert.equal(s.directory.total,0);assert.equal(s.mappedStatus,'error');assert(!s.failure);
});
