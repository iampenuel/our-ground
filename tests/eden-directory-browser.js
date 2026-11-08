// Opt-in browser verification only; not an entry of the product build.
import '../src/design-tokens.css';
import '../src/institution-media.css';
import '../src/styles.css';
import '../src/support.css';
import '../src/discovery.css';
import '../src/unified-support.css';
import '../src/support-resource-context.css';
import {mountSupportPage} from '../src/support-page.ts';
import {createEdenSupportNavigator} from '../src/eden/support-navigation.ts';
import {executeEdenAction,edenPageRevision,edenLocalPageContext} from '../src/eden/application-bridge.ts';

const button=document.getElementById('replay'),result=document.getElementById('checkStatus');
const check=(pass,message)=>{if(!pass)throw Error(message);};
const status=message=>{result.textContent=message;};
button.addEventListener('click',async()=>{
  button.disabled=true;
  try{
    check(import.meta.env.DEV && location.origin==='http://127.0.0.1:5199','This replay requires the authorized local development origin.');
    const [rows,food]=await Promise.all(['/output/phase-7d/real-directory-harrisburg.json','/docs/implementation/final-discovery-food-verification.json'].map(async path=>(await fetch(path)).json()));
    const counts={city:0,directory:0,detail:0};
    const request=async(path,init)=>{
      if(path==='locations/status')return{configured:false,referenceConfigured:true};
      if(path==='geoapify/status')return{enabled:false};
      if(path==='places/directory-city?city=harrisburg-pa'){
        counts.city++;
        return{location:{label:'Harrisburg, PA',publicQuery:'Harrisburg, PA',...rows.search_center,state:'PA',country:'US',source:'reference',quality:{kind:'canonical_exact',source:'reference',precision:'city',coordinateSource:'reference',sourceName:'Archived search center (test)',explanation:'Historical search response replay.'}}};
      }
      if(path==='resources/search'){
        counts.directory++;const q=JSON.parse(init.body);
        check(q.location.publicQuery==='Harrisburg, PA' && q.data_kind==='real','Unexpected location or data mode.');
        if(q.category==='food')check(food.searches.some(r=>r.city==='Harrisburg PA' && r.radius===q.radius_miles && r.imported_total===0),'Missing historical food evidence.');
        const items=rows.items.filter(r=>r.category_slugs.includes(q.category)&&r.distance_miles<=q.radius_miles);
        return{...rows,items,total:items.length,has_next:false};
      }
      if(path.startsWith('resources/')){
        counts.detail++;const r=rows.items.find(row=>row.id===path.slice(10));check(r,'Unknown archived record.');
        // No details response was captured; display only facts present on the archived card.
        return{...r,description:r.summary,hours:[],eligibility_text:null,cost_summary:null,contact:{...r.contact,directions_url:null},source:{url:r.provenance.source_url,recorded_at:r.source_recorded_at}};
      }
      throw Error('Unexpected API request.');
    };
    history.replaceState(null,'','/');
    const signal=new AbortController().signal,view=edenLocalPageContext;
    const act=async(action)=>{const outcome=await executeEdenAction(action,edenPageRevision(),signal);check(outcome.status==='done','Action did not finish: '+action.type);};
    await act({type:'read-page'});
    const ensure=createEdenSupportNavigator(async()=>async(root,options)=>mountSupportPage(root,{...options,request,mapKey:import.meta.env.VITE_GEOAPIFY_BROWSER_KEY}));
    await ensure({type:'search',category:'food',city:'harrisburg-pa',radius:10},{signal,publicDirectory:true,hasSupportPage:()=>view().route==='support'});
    const confirm=(category,radius,count)=>{const v=view();check(v.route==='support' && v.loading==='ready' && v.cityId==='harrisburg-pa' && v.category===category && v.radius===radius && v.resultCount===count,'Unexpected archive search result.');};
    confirm('food',10,0);await act({type:'radius',radius:5});confirm('food',5,0);
    await act({type:'search',category:'healthcare',city:'harrisburg-pa',radius:10});confirm('healthcare',10,6);
    await act({type:'radius',radius:5});confirm('healthcare',5,4);
    await act({type:'details',index:1});check(view().route==='resource' && view().selectedIndex===1,'Archive detail not selected.');
    await act({type:'select',index:1});
    const stop=Date.now()+15000;
    while(view().mapState==='loading' && Date.now()<stop)await new Promise(resolve=>setTimeout(resolve,100));
    const markers=[...document.querySelectorAll('.geo-map-pin')];
    check(view().mapState==='ready' && markers.length===4 && markers[0].getAttribute('aria-pressed')==='true','Map not verified; use the selected list result.');
    markers[1].click();
    check(view().selectedIndex===2 && markers[1].getAttribute('aria-pressed')==='true','Marker 2 and list selection differ.');
    check(counts.city===2 && counts.directory===4 && counts.detail===1,'Unexpected request count.');
    await act({type:'select',index:2}); // Also verify the map can focus the selection made from the marker.
    status('PASS: food 0 → 0; healthcare 6 → 4; archived details and map/list selection passed. Two city reads; no lookup for either radius change.');
    document.getElementById('supportMapFrame').scrollIntoView({block:'center',behavior:'instant'});
  }catch(error){status('BLOCKED: '+(error instanceof Error?error.message:'verification incomplete'));}
});
