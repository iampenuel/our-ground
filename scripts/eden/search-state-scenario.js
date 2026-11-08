// Browser acceptance: only the EDEN proposals are mocked. The 422 changes one outgoing request in this tab.
(async()=>{
 const out={actions:[],cases:[],responses:[],map:{},faults:[],viewport:[innerWidth,innerHeight]};
 const verify=(ok,msg)=>{if(!ok)throw Error(msg);},sleep=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,msg,max=16000)=>{const end=performance.now()+max;while(performance.now()<end){if(fn())return;await sleep(65);}throw Error(msg);};
 const $=id=>document.getElementById(id),cards=()=>[...document.querySelectorAll('[data-card-key]')],pins=()=>[...document.querySelectorAll('.geo-map-pin')];
 let invalid=false,hold=false,resume;
 const fetchReal=window.fetch.bind(window);window.fetch=async(input,init)=>{
  const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
  if(path==='/api/v1/resources/search'&&init?.method==='POST'){
   if(hold){hold=false;await new Promise(r=>resume=r);}
   if(invalid){invalid=false;init={...init,body:JSON.stringify({...JSON.parse(init.body),radius_miles:-1})};}
  }
  const r=await fetchReal(input,init);
  if(['/api/v1/locations/resolve','/api/v1/resources/search'].includes(path)){
   const j=await r.clone().json();out.responses.push({path,status:r.status,total:j.total,code:j.error?.code,retry:r.headers.get('retry-after')});
  }return r;
 };
 try{
 const calls=__CALLS__,assets=__ASSETS__,bridge=await import(assets.bridge),nav=await import(assets.nav),pub=await import(assets.pub);
 const view=bridge.n,signal=new AbortController().signal,prop=a=>{const c=calls.find(c=>Object.keys(a).length===Object.keys(c.args).length&&Object.entries(a).every(([k,v])=>c.args[k]===v));verify(c,'No validated proposal');return c.args;};
 const act=async a=>{const r=await bridge.a(prop(a),bridge.i(),signal);out.actions.push({type:a.type,status:r.status,message:r.message});return r;};
 const read=async(status,terms)=>{const r=await act({type:'read-results'});verify(r.status===status&&terms.every(t=>r.message.includes(t)),'Unexpected read: '+r.message);return r.message;};
 const search=async(city,category,radius)=>{const a={type:'search',city:city.toLowerCase()+'-pa',category,radius};const n=await nav.t(prop(a),{signal,publicDirectory:true,hasSupportPage:()=>['support','resource'].includes(view().route)});if(!n.initialSearch)return act(a);};
 const go=page=>pub.navigateEdenPublicPage(prop({type:'navigate-public',page}).page,{signal,publicDirectory:true});
 const count=async(city,cat,miles,total,keyword='')=>{const last=window.__receipt.at(-1);verify(last&&last.input.location.publicQuery===city+', PA'&&last.input.category===cat&&last.input.radius_miles===miles&&last.input.q===keyword&&last.total===total,'API filters/total mismatch: '+JSON.stringify(last?.input));verify(cards().length===Math.min(20,total)&&view().loading==='ready','Wrong displayed rows/state');
 const terms=[city,cat==='food'?'Food':'Healthcare',miles+' miles',...(keyword?['“'+keyword+'”']:[]),...(total?[total+' matching directory listing']:['completed','no matching listings','Services may still be available'])];const message=await read('done',terms);out.cases.push({city,cat,miles,total,keyword,message});if(!total&&cat==='food'){const box=$('foodReferrals'),links=[...box.querySelectorAll('a')].map(a=>a.href);verify(box.getClientRects().length&&links.includes('https://www.211.org/about-us/your-local-211')&&links.includes('https://www.feedingamerica.org/find-your-local-foodbank')&&['211','Feeding America'].every(x=>message.includes(x)),'Empty coverage referrals');}};
 await wait(()=>$('eden-assistant')&&document.querySelector('h1'),'Homepage');await go('support');
 await read('clarify',['No search has been run']);out.unstarted=true;
 hold=true;const first=search('Harrisburg','food',10);await wait(()=>resume&&view().loading==='loading','Pending request');await read('unavailable',['Harrisburg','still loading']);resume();await first;
 await count('Harrisburg','food',10,0);await go('about');await go('support');await count('Harrisburg','food',10,0);
 await act({type:'radius',radius:5});await count('Harrisburg','food',5,0);
 await act({type:'refine',category:'healthcare'});await count('Harrisburg','healthcare',5,2);await act({type:'radius',radius:10});await count('Harrisburg','healthcare',10,3);
 await act({type:'select',index:1});await wait(()=>pins().length===3&&view().mapState==='ready','Harrisburg map');
 pins().find(p=>Number(p.textContent)===2).click();await wait(()=>view().selectedIndex===2&&cards()[1].dataset.selected==='true','Pin→card');
 cards()[0].querySelector('[data-result-key]').click();await wait(()=>view().selectedIndex===1&&pins().find(p=>Number(p.textContent)===1)?.getAttribute('aria-pressed')==='true','Card→pin');
 const det=await act({type:'details',index:1});verify(det.status==='done'&&view().route==='resource','Open public details');out.map={markerToList:true,listToMarker:true,opened:view().results[0].title};document.querySelector('[data-resource-close]')?.click();
 await search('Pittsburgh','food',10);await count('Pittsburgh','food',10,0);await search('Philadelphia','food',10);await count('Philadelphia','food',10,323);
 const input=v=>{const kw=$('keywordInput');kw.value=v;kw.dispatchEvent(new Event('input',{bubbles:true}));},submitKeyword=async()=>{$('searchDirectoryKeyword').click();await wait(()=>!$('searchDirectoryKeyword').disabled,'Keyword completion');};
 input('share');await read('clarify',['filters have changed','“share”']);verify(view().resultCount===0,'Draft exposed previous result IDs');await submitKeyword();await count('Philadelphia','food',10,1,'share');
 await go('give');await go('support');await count('Philadelphia','food',10,1,'share');await act({type:'radius',radius:5});await count('Philadelphia','food',5,window.__receipt.at(-1).total,'share');
 input('eden13-no-such-pantry');await submitKeyword();await count('Philadelphia','food',5,0,'eden13-no-such-pantry');
 invalid=true;await submitKeyword();verify(out.responses.at(-1).status===422,'Expected real backend rejection');await read('unavailable',['could not finish','No directory count']);out.faults.push({status:422,code:out.responses.at(-1).code});
 input('share');await submitKeyword();await count('Philadelphia','food',5,window.__receipt.at(-1).total,'share');out.errorRecovery=true;
 // Consume only the documented six-per-minute manual resolver allowance for this review IP.
 // Directory-only EDEN searches above do not consume this bucket.
 const warm=await Promise.all(Array.from({length:6},()=>fetch('/api/v1/locations/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:'Harrisburg, PA',sessionToken:crypto.randomUUID()})}).then(r=>r.status)));verify(warm.every(s=>s===200||s===429),'Unexpected limiter priming');
 input('');const loc=$('locationInput');loc.value='Harrisburg, PA';loc.dispatchEvent(new Event('input',{bubbles:true}));const submit=()=>$('locationForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 const idx=out.responses.length;submit();await wait(()=>out.responses.slice(idx).some(r=>r.path.endsWith('/resolve')&&r.status===429)&&view().loading==='error','Real 429 in submitted page search');
 const denied=out.responses.slice(idx).find(x=>x.status===429);const denial=await read('unavailable',['rate-limited','No directory count']);out.faults.push({...denied,message:denial});await wait(()=>!$('supportSubmit').disabled,'Retry window did not expire',70000);
 const n=out.responses.length;submit();await wait(()=>out.responses.slice(n).some(r=>r.path.endsWith('/resources/search')&&r.status===200)&&view().loading==='ready','Real rate-limit recovery');const recovered=await read('done',['Harrisburg','completed']);out.rateRecovery=recovered;
 out.pass=true;
 }catch(e){out.pass=false;out.error=String(e.message).slice(0,450);}finally{window.fetch=fetchReal;resume?.();}return out;
})()
