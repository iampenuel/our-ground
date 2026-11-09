// Real protected service; all input here is synthetic and public.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {strict as assert} from 'node:assert';
import {protectRecoveryOrigin} from './recovery-origin.mjs';
const base=new URL(process.env.RECOVERY_BASE).origin;
const token=process.env.VERCEL_OIDC_TOKEN;
assert(token);
const dir=process.env.RECOVERY_IMAGES??'docs/release/eden-recovery-images/staging';await mkdir(dir,{recursive:true});
const receipt={base,started:new Date().toISOString(),steps:[],errors:[],productionTouched:false};
const out=join(dir,'gemini-context.json');
const save=()=>writeFile(out,JSON.stringify(receipt,null,2)+'\n');
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 p.setDefaultTimeout(35000);const requests=[];
 await protectRecoveryOrigin(p,base,token);
 p.on('pageerror',e=>receipt.errors.push(e.name));
 p.on('response',async r=>{
   const path=new URL(r.url()).pathname;
   if(path.includes('/eden/hosted/')){
     const evt={endpoint:path.split('/').at(-1),status:r.status()};
     requests.push(evt);if(evt.status>=400){const body=await r.json().catch(()=>null);evt.code=body?.error?.code;}
   }
 });
 await p.goto(base);await p.locator('.eden-launch').click();
 const answers=p.locator('.eden-message[aria-label="Eden"]'),draft=p.locator('#eden-command');
 async function ask(label,text){
   const before=await answers.count(),n=requests.length,step={name:label};receipt.steps.push(step);
   await draft.fill(text);await draft.press('Enter');
   if(await p.locator('.eden-consent').isVisible()){
     for(const c of await p.locator('.eden-consent input:visible').all())await c.check();
     await p.locator('[data-continue]').click();
   }
   await p.waitForFunction(n=>document.querySelectorAll('.eden-message[aria-label="Eden"]').length>n||Boolean(document.querySelector('[data-retry]:not([hidden])')),before,{timeout:40000}).catch(()=>{});
   step.answer=await answers.count()>before?await answers.last().innerText():null;
   step.requests=requests.slice(n);
   step.state={page:new URL(p.url()).pathname,count:await p.locator('[data-card-key^="directory:"]').count(),city:await p.locator('#locationInput').inputValue({timeout:300}).catch(()=>null),category:await p.locator('[data-category][aria-pressed=true]').getAttribute('data-category',{timeout:400}).catch(()=>null)};
   if(!step.answer)step.failure=(await p.locator('.eden-state').innerText()).slice(0,120);
   console.log(JSON.stringify({name:label,requests:step.requests,state:step.state,answer:step.answer?.slice(0,190),failure:step.failure}));
   await save();
   if(step.requests.some(r=>r.status===429))throw Error('Rate capped; remaining probes were not sent.');
   return step;
 }
 const typo=await ask('typo clarification','Find healthcare near Harisburg.');
 typo.pass=/did you mean harrisburg/i.test(typo.answer??'')&&typo.state.page==='/';
 const accepted=await ask('affirm correction','yes');
 accepted.pass=accepted.state.city==='Harrisburg, PA'&&accepted.state.category==='healthcare'&&accepted.state.count>0&&accepted.requests.some(r=>r.endpoint==='result'&&r.status===200);
 if(!accepted.pass)throw Error('Corrected city did not establish directory results.');
 const card=p.locator('[data-card-key^="directory:"]').first();const title=await card.locator('h3 .discovery-select > span').nth(1).textContent().catch(()=>null);
 await new Promise(r=>setTimeout(r,21000));
 const page=await ask('natural page question','What am I looking at on this page?');
 page.pass=page.requests.some(r=>r.endpoint==='result'&&r.status===200)&&/current view shows|result|map section|list is in view/i.test(page.answer??'');
 await new Promise(r=>setTimeout(r,21000));
 const details=await ask('first visible listing follow-up','Tell me more about the first listing.');
 details.visibleTitle=title;
 details.match=Boolean(title&&details.answer?.toLowerCase().includes(title.trim().toLowerCase()));
 details.detailOpen=await p.locator('[data-resource-content]:visible').count()>0;
 details.pass=details.match&&details.detailOpen&&details.requests.some(r=>r.endpoint==='result'&&r.status===200);
 await new Promise(r=>setTimeout(r,21000));
 const correction=await ask('contextual city correction','No, I meant Harrisburg, not Berkley.');
 correction.pass=correction.state.category==='healthcare'&&correction.state.city==='Harrisburg, PA'&&correction.requests.some(r=>r.endpoint==='result'&&r.status===200);
 await new Promise(r=>setTimeout(r,21000));
 const joinOrg=await ask('organization participation','How can my organization join?');
 joinOrg.pass=joinOrg.state.page==='/organizations' && /sign in|access/i.test(joinOrg.answer??'');
 assert(receipt.steps.every(s=>s.pass)&&!receipt.errors.length,'A page or action did not match its reply.');
} catch(e){process.exitCode=1;receipt.block=String(e?.message??e).slice(0,160);}
finally{receipt.finished=new Date().toISOString();await save();await browser.close();console.log(receipt.block??'Completed deeper probes');}
