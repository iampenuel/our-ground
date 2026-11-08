// Executed in the protected unchanged Preview by check-pa-preview.mjs. Tool proposals are mocked, data and maps are not.
(async()=>{
 const out={actions:[],cases:[],referrals:[],map:null};
 const must=(ok,msg)=>{if(!ok)throw Error(msg);};
 const until=async(fn,msg)=>{for(let i=0;i<170;i++){if(fn())return;await new Promise(r=>setTimeout(r,90));}throw Error(msg);};
 try{
 const assets=__ASSETS__,calls=__CALLS__,db=__CASES__,bridge=await import(assets.bridge),nav=await import(assets.nav);
 const signal=new AbortController().signal,view=bridge.n,cards=()=>[...document.querySelectorAll('[data-card-key]')],pins=()=>[...document.querySelectorAll('.geo-map-pin')];
 const proposal=a=>{const call=calls.find(c=>JSON.stringify(c.args,Object.keys(c.args).sort())===JSON.stringify(a,Object.keys(a).sort())&&Object.keys(c.args).length===Object.keys(a).length);must(call,'Unapproved action');return call.args;};
 const act=async(a)=>{const r=await bridge.a(proposal(a),bridge.i(),signal);out.actions.push({action:a,status:r.status,message:r.message});return r;};
 const check=async(city,category,radius)=>{const place=city+', PA',key=city.toLowerCase()+'-pa',expected=db.find(x=>x.city===city&&x.category===category&&x.radius===radius&&!x.q);
 const receipt=()=>window.__receipt.findLast(x=>x.input.location.publicQuery===place&&x.input.category===category&&x.input.radius_miles===radius&&!x.input.q);
 await until(()=>receipt()&&view().cityId===key&&view().loading==='ready'&&view().category===category&&view().radius===radius&&cards().length===expected.total,'City/category/radius/count mismatch');
 must(expected.total===receipt().total&&JSON.stringify(receipt().ids)===JSON.stringify(cards().map(c=>c.dataset.cardKey.slice(10))),'Unexpected directory IDs');
 out.cases.push({city,category,radius,total:receipt().total});};
 for(const city of ['Pittsburgh','Harrisburg']){
 const q={type:'search',city:city.toLowerCase()+'-pa',category:'food',radius:10},n=await nav.t(proposal(q),{signal,publicDirectory:true,hasSupportPage:()=>['support','resource'].includes(view().route)});
 if(!n.initialSearch)must((await act(q)).status==='done','Search failed');
 await check(city,'food',10);
 const referrals=document.querySelector('#foodReferrals');must(referrals.getClientRects().length&&/incomplete.*help may still be available/i.test(referrals.innerText),'Missing food coverage warning');
 const links=[...referrals.querySelectorAll('a[href^="https:"]')].map(a=>a.href);must(links.includes('https://www.feedingamerica.org/find-your-local-foodbank')&&links.includes('https://www.211.org/about-us/your-local-211'),'Missing referral links');
 const read=await act({type:'read-results'});out.referrals.push({city,message:referrals.querySelector('p').innerText,links,emptyRead:read.message});
 must((await act({type:'refine',category:'healthcare'})).status==='done','Follow-up failed');await check(city,'healthcare',10);
 }
 must((await act({type:'radius',radius:5})).status==='done','Radius failed');await check('Harrisburg','healthcare',5);
 must((await act({type:'select',index:1})).status==='done','Map selection failed');await until(()=>pins().length===2&&view().mapState==='ready','Expected two pins');
 const matches=i=>cards()[i-1].dataset.selected==='true'&&view().selectedIndex===i&&pins().find(p=>Number(p.textContent)===i)?.getAttribute('aria-pressed')==='true';
 pins().find(p=>Number(p.textContent)===2).click();await until(()=>matches(2),'Pin to listing');
 cards()[0].querySelector('[data-result-key]').click();await until(()=>matches(1),'Listing to pin');
 out.map={city:'Harrisburg',pins:2,markerToList:true,listToMarker:true};
 must((await act({type:'details',index:1})).status==='done','Open details');const source=cards()[0].querySelector('.support-card-source');source.open=true;must(source.querySelector('a').href==='https://data.hrsa.gov/topics/health-centers/'&&cards()[0].innerText.includes('Not independently verified'),'Missing provenance');
 out.detail={title:view().results[0].title,source:source.querySelector('a').href,importedUnverified:true};out.pass=true;
 }catch(e){out.pass=false;out.error=e.message;}return out;
})()
