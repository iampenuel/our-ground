import test from 'node:test';
import assert from 'node:assert/strict';
import {mountEdenIntroduction} from '../src/eden/runtime/introduction.ts';
function fixture(options={}){
 const animations=[],cancelled=[];
 const animate=(_frames,timing)=>{animations.push(timing);return{cancel(){cancelled.push(true);}};};
 const card=Object.assign(new EventTarget(),{hidden:true,animate}),dismissButton=new EventTarget(),launcher={animate};
 return{card,dismissButton,animations,cancelled,controller:mountEdenIntroduction(card,dismissButton,{...options,launcher})};
}
test('the homepage invitation stays visible without focus changes or timed dismissal',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const current=fixture();assert.equal(current.card.hidden,false);
 t.mock.timers.tick(60000);current.card.dispatchEvent(new Event('focusout'));
 assert.equal(current.card.hidden,false);current.controller.dispose();
});
test('opening hides the invitation and closing restores it without repeating its entrance',()=>{
 const current=fixture();
 assert.deepEqual(current.animations.map(a=>a.duration),[300,180]);
 current.controller.temporarilyHide();assert.equal(current.card.hidden,true);
 current.controller.restore();assert.equal(current.card.hidden,false);
 current.controller.setPageAllowed(false);assert.equal(current.card.hidden,true);
 current.controller.setPageAllowed(true);assert.equal(current.card.hidden,false);
 assert.equal(current.animations.length,2);current.controller.dispose();
});
test('X dismisses only this page load and a fresh mount welcomes again',()=>{
 const current=fixture(),click=new Event('click',{bubbles:true});
 current.dismissButton.dispatchEvent(click);assert.equal(click.cancelBubble,true);assert.equal(current.card.hidden,true);
 current.controller.restore();current.controller.setPageAllowed(false);current.controller.setPageAllowed(true);
 assert.equal(current.card.hidden,true);current.controller.dispose();
 const refreshed=fixture();assert.equal(refreshed.card.hidden,false);refreshed.controller.dispose();
});
test('non-home pages keep the invitation hidden and reduced motion starts static',()=>{
 const other=fixture({homepage:false});assert.equal(other.card.hidden,true);assert.equal(other.animations.length,0);
 other.controller.setPageAllowed(true);assert.equal(other.card.hidden,false);assert.equal(other.animations.length,0);other.controller.dispose();
 const reduced=fixture({reducedMotion:true});assert.equal(reduced.card.hidden,false);assert.equal(reduced.animations.length,0);reduced.controller.dispose();
});
test('disposal removes the dismissal listener and cancels its two bounded animations',()=>{
 const current=fixture();current.controller.dispose();current.controller.dispose();assert.equal(current.card.hidden,true);assert.equal(current.cancelled.length,2);
 current.dismissButton.dispatchEvent(new Event('click'));current.controller.restore();assert.equal(current.card.hidden,true);
});
