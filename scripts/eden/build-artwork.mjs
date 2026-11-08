import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {paths,mouthPoses,mouthGeometry} from './artwork.mjs';
const root=new URL('../../',import.meta.url),out=new URL('src/eden/animation/rive/',root);
const silhouette=JSON.parse(await readFile(new URL('public/assets/eden/rig/silhouette.json',root),'utf8')).d;
const exteriorLayers=new Set(['headMaster','backHairArt','torsoCardiganTopNecklace','leftLongHairArt','rightLongHairArt']);
await mkdir(new URL('assets/',out),{recursive:true});
await copyFile(new URL('public/assets/eden/approved-original/eden.png',root),new URL('assets/approved.png',out));
await copyFile(new URL('public/assets/eden/rig/face-clean-plate.png',root),new URL('assets/face-clean.png',out));
let next=100;const ids={};const id=name=>ids[name]??(ids[name]=`0:${next++}`);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;');
// Parse our restricted absolute M/L/C/Z contours into native cubic vertices.
function contours(d){
 const tok=d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g);let i=0,parts=[],p,v,first;
 while(i<tok.length){const c=tok[i++];const n=()=>Number(tok[i++]);
  if(c==='M'){p=[];parts.push(p);v={x:n(),y:n()};p.push(v);first=v;}
  else if(c==='L'){v={x:n(),y:n()};p.push(v);}
  else if(c==='C'){v.out=[n(),n()];const incoming=[n(),n()],x=n(),y=n();if(x===first.x&&y===first.y&&tok[i]==='Z'){first.in=incoming;v=first;}else{v={x,y,in:incoming};p.push(v);}}
  else if(c!=='Z')throw new Error(`Unsupported path token ${c}`);
 }return parts;
}
function geometry(d,name){return contours(d).map((vs,pi)=>`<PointsPath isClosed="true" name="${name} contour ${pi}">${vs.map(v=>{
 const angle=p=>p?Math.atan2(p[1]-v.y,p[0]-v.x):0,dist=p=>p?Math.hypot(p[0]-v.x,p[1]-v.y):0;
 return `<CubicDetachedVertex x="${v.x}" y="${v.y}" inRotation="${angle(v.in)}" inDistance="${dist(v.in)}" outRotation="${angle(v.out)}" outDistance="${dist(v.out)}"/>`;
 }).join('')}</PointsPath>`).join('');}
const raster=(name,d,asset='approved')=>({kind:'raster',name,d,asset});
const shape=(name,d,fill)=>({kind:'shape',name,d,fill});
const group=(name,x,y,children)=>({kind:'group',name,x,y,children});
const mouth=mouthGeometry();
const eye=(side,x)=>group(`${side}Eye`,x,511,[
 {kind:'aperture',name:`${side}Aperture`,x:x-85,y:486,width:170,height:92,children:[
 group(`${side}Gaze`,x,511,[group(`${side}Pupil`,x,511,[raster(`${side}PupilArt`,paths[`${side}Pupil`])])]),raster(`${side}Lash`,paths[`${side}Lash`])]},
]);
const tree=[
 group('backHair',650,900,[raster('backHairArt',paths.backHair),shape('reconstructedHiddenHair','M 338 510 C 390 456 824 433 928 515 L 930 786 C 940 835 959 861 967 886 L 761 937 L 500 914 L 338 796 Z','301b15')]),
 group('body',650,1254,[raster('torsoCardiganTopNecklace',paths.torso),shape('reconstructedHiddenNeck','M 539 736 C 580 783 648 804 707 797 L 709 840 C 647 841 581 810 538 767 Z','d47a41')]),
 group('leftLongHair',385,850,[raster('leftLongHairArt',paths.leftLongHair)]),
 group('rightLongHair',891,750,[raster('rightLongHairArt',paths.rightLongHair)]),
 group('head',660,870,[
  raster('headMaster',paths.head,'face-clean'),
  group('leftEarring',442,653,[raster('leftHoopArt',paths.leftHoop)]),
  group('rightEarring',882,653,[raster('rightHoopArt',paths.rightHoop)]),
  group('leftBrow',640,432,[raster('leftBrowArt',paths.leftBrow)]),
  group('rightBrow',804,430,[raster('rightBrowArt',paths.rightBrow)]),
  eye('left',637),eye('right',804),
  {kind:'lid',name:'leftLid',d:'M 567 515 C 595 534 642 532 678 518'},
  {kind:'lid',name:'rightLid',d:'M 779 516 C 800 531 833 530 861 516'},
  group('mouth',714,669,[shape('mouthCavity',mouth.outer,'7b1f13'),shape('mouthTongue',mouth.tongue,'c3422c'),shape('mouthTeeth',mouth.teeth,'fffefa')]),
  group('frontHairLeft',609,349,[raster('frontHairLeftArt',paths.leftFront)]),
  group('frontHairRight',816,316,[raster('frontHairRightArt',paths.rightFront)]),
 ])
];
let svgDefs='<clipPath id="sourceSilhouette"><path d="'+silhouette+'"/></clipPath>';const original=await readFile(new URL('assets/approved.png',out)),clean=await readFile(new URL('assets/face-clean.png',out));
svgDefs+=`<image id="approved" width="1254" height="1254" href="data:image/png;base64,${original.toString('base64')}"/><image id="face-clean" width="1254" height="1254" href="data:image/png;base64,${clean.toString('base64')}"/>`;
function svg(n){
 if(n.kind==='group')return `<g id="${n.name}" data-pivot="${n.x} ${n.y}" transform="translate(${n.x} ${n.y})"><g transform="translate(${-n.x} ${-n.y})">${n.children.map(svg).join('')}</g></g>`;
 if(n.kind==='raster'){svgDefs+=`<clipPath id="${n.name}Mask"><path d="${n.d}" clip-rule="evenodd"/></clipPath>`;return `<g id="${n.name}" clip-path="url(#${n.name}Mask)"><use href="#${n.asset}" ${exteriorLayers.has(n.name)?'clip-path="url(#sourceSilhouette)"':''}/></g>`;}
 if(n.kind==='shape')return `<path id="${n.name}" d="${n.d}" fill="#${n.fill}"/>`;
 if(n.kind==='lid')return `<path id="${n.name}" d="${n.d}" fill="none" stroke="#17120e" stroke-width="9" stroke-linecap="round" opacity="0"/>`;
 if(n.kind==='aperture'){svgDefs+=`<clipPath id="${n.name}Mask"><rect id="${n.name}" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}"/></clipPath>`;return `<g clip-path="url(#${n.name}Mask)">${n.children.map(svg).join('')}</g>`;}
}
const svgBody=tree.map(svg).join('');
await writeFile(new URL('public/assets/eden/rig/eden-layered.svg',root),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 0 1090 1254" role="img" aria-label="EDEN, Our Ground’s illustrated support guide"><title>EDEN — layered partial rig</title><defs>${svgDefs}</defs>${svgBody}</svg>`);
const bind=(prop,key,conv='')=>`<DataBindContext sourcePathIds="0:40-${prop}" propertyKey="${key}"${conv?` converterId="${conv}"`:''}/>`;
function rml(n){
 const nid=id(n.name);
 if(n.kind==='group')return `<Node id="${nid}" name="${n.name}" x="${n.x}" y="${n.y}"><Node x="${-n.x}" y="${-n.y}" name="${n.name} local artwork">${[...n.children].reverse().map(rml).join('')}</Node></Node>`;
 if(n.kind==='raster'){const mask=id(`${n.name}Mask`),outer=id(`${n.name}Silhouette`);return `<Node name="${n.name}" id="${nid}"><ClippingShape sourceId="${mask}" fillRule="evenOdd"/><Image assetId="${n.asset==='approved'?'0:60':'0:61'}" x="627" y="627" name="Source texture">${exteriorLayers.has(n.name)?`<ClippingShape sourceId="${outer}"/>`:""}</Image>${exteriorLayers.has(n.name)?`<Shape id="${outer}" name="Exact exterior contour">${geometry(silhouette,"Exterior")}</Shape>`:""}<Shape id="${mask}" name="${n.name} contour">${geometry(n.d,n.name)}</Shape></Node>`;}
 if(n.kind==='shape')return `<Shape id="${nid}" name="${n.name}">${geometry(n.d,n.name)}<Fill><SolidColor colorValue="FF${n.fill}"/></Fill></Shape>`;
 if(n.kind==='lid')return `<Shape id="${nid}" name="${n.name}" opacity="0">${geometry(n.d,n.name).replace('isClosed="true"','isClosed="false"')}<Stroke thickness="9" cap="round"><SolidColor colorValue="FF17120e"/></Stroke></Shape>`;
 if(n.kind==='aperture'){const mask=id(`${n.name}Mask`);return `<Node name="${n.name} clip"><ClippingShape sourceId="${mask}"/>${[...n.children].reverse().map(rml).join('')}<Shape id="${mask}" name="${n.name} clip shape"><Rectangle id="${nid}" x="${n.x}" y="${n.y}" originX="0" originY="0" width="${n.width}" height="${n.height}"/></Shape></Node>`;}
}
const art=[...tree].reverse().map(rml).join('');
const key=(obj,prop,values)=>`<KeyedObject objectId="${id(obj)}"><KeyedProperty property="${prop}">${values.map(([frame,value])=>`<KeyFrameDouble frame="${frame}" value="${value}" interpolationType="cubic"><CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/></KeyFrameDouble>`).join('')}</KeyedProperty></KeyedObject>`;
const condition=(p,value,bool=false)=>`<TransitionViewModelCondition opValue="equal"><TransitionPropertyViewModelComparator><BindableProperty${bool?'Boolean':'Number'}>${bind(p,bool?634:636)}</BindableProperty${bool?'Boolean':'Number'}></TransitionPropertyViewModelComparator><TransitionValue${bool?'Boolean':'Number'}Comparator value="${value}"/></TransitionViewModelCondition>`;
const transition=(to,cond,duration=320)=>`<StateTransition stateToId="${to}" duration="${duration}" enableEarlyExit="true" interpolationType="cubic"><CubicEaseInterpolator x1="0.22" y1="0" x2="0.35" y2="1"/>${cond}</StateTransition>`;
const states=['idle','listening','thinking','searching','speaking','success','clarifying','unable'];
const poses=[ [0,0,0,0,0],[-.018,-4,-5,1,0],[.012,-2,-8,3,-1],[.004,-3,-3,-3,0],[-.006,-3,-2,0,0],[0,3,-7,0,0],[.022,-2,-9,2,0],[-.008,1,2,0,1] ];
let animations='',stateNodes='';
for(let i=0;i<states.length;i++){
 const [rot,dy,brow,gx,gy]=poses[i];let frames=i===5?[[0,0],[18,4],[36,0],[65,0]]:[[0,0]];
 const tracks=key('head','rotation',[[0,rot]])+key('head','y',frames.map(([f,v])=>[f,870+dy+v]))+key('leftBrow','y',[[0,432+brow]])+key('rightBrow','y',[[0,430+brow*.65]])+key('leftPupil','x',[[0,637+gx]])+key('rightPupil','x',[[0,804+gx]])+key('leftPupil','y',[[0,511+gy]])+key('rightPupil','y',[[0,511+gy]]);
 animations+=`<LinearAnimation id="0:${2000+i}" name="${states[i]}" fps="60" duration="${i===5?90:120}" loopValue="${i===5?'oneShot':'loop'}">${tracks}</LinearAnimation>`;
 stateNodes+=`<AnimationState id="0:${2100+i}" animationId="0:${2000+i}" x="${180+(i%4)*250}" y="${Math.floor(i/4)*190}" reset="true">${states.map((_,j)=>i===j?'':transition(`0:${2100+j}`,condition('0:42',j))).join('')}</AnimationState>`;
}
const machine=`<StateMachine name="Eden" id="0:7"><StateMachineLayer name="Expression"><EntryState x="0" y="0">${transition('0:2100','',0)}</EntryState><AnyState x="0" y="-160"/><ExitState x="250" y="-160"/>${stateNodes}</StateMachineLayer>
<StateMachineLayer name="Speech"><EntryState x="0" y="0">${transition('0:2200','',0)}</EntryState><AnyState x="0" y="-160"/><ExitState x="240" y="-160"/>${states.map((_,i)=>{
 const trans=states.map((_,j)=>i===j?'':transition('0:'+(2200+j),condition('0:42',j),200)).join('');
 if(i===4)return '<BlendState1DViewModel x="180" y="180" id="0:2204"><BindablePropertyNumber>'+bind('0:43',636,'0:80')+'</BindablePropertyNumber>'+Object.keys(mouthPoses).map((_,j)=>'<BlendAnimation1D animationId="0:'+(2300+j)+'" value="'+j*20+'"/>').join('')+trans.replaceAll('StateTransition','BlendStateTransition')+'</BlendState1DViewModel>';
 return '<AnimationState x="'+(180+(i%4)*250)+'" y="'+Math.floor(i/4)*180+'" id="0:'+(2200+i)+'" animationId="0:'+(2300+[5,1,0,1,0,5,1,1][i])+'">'+trans+'</AnimationState>';
}).join('')}</StateMachineLayer>
<StateMachineLayer name="Quiet motion"><EntryState x="0" y="0">${transition('0:2400','',0)}</EntryState><AnyState x="0" y="-160"/><ExitState x="240" y="-160"/><AnimationState x="200" y="0" id="0:2400" animationId="0:2500">${transition('0:2401',condition('0:44',true,true),0)}${transition('0:2402',condition('0:47',true,true),0)}</AnimationState><AnimationState x="450" y="0" id="0:2401" animationId="0:2501">${transition('0:2400',condition('0:44',false,true)+condition('0:47',false,true),180)}${transition('0:2402',condition('0:44',false,true)+condition('0:47',true,true),180)}</AnimationState><AnimationState x="700" y="0" id="0:2402" animationId="0:2502">${transition('0:2401',condition('0:44',true,true),0)}${transition('0:2400',condition('0:47',false,true),180)}</AnimationState></StateMachineLayer>
<StateMachineLayer name="Mouth inspection"><EntryState x="0" y="0">${transition('0:2600','',0)}</EntryState><AnyState x="0" y="-160"/><ExitState x="240" y="-160"/><AnimationState x="200" y="0" id="0:2600" animationId="0:2700">${transition('0:2601',condition('0:45',0).replace('opValue="equal"','opValue="greaterThanOrEqual"'),180)}</AnimationState><BlendState1DViewModel x="450" y="0" id="0:2601"><BindablePropertyNumber>${bind('0:45',636,'0:81')}</BindablePropertyNumber>${Object.keys(mouthPoses).map((_,i)=>'<BlendAnimation1D animationId="0:'+(2300+i)+'" value="'+i*20+'"/>').join('')}<BlendStateTransition stateToId="0:2600" duration="160" enableEarlyExit="true">${condition('0:45',0).replace('opValue="equal"','opValue="lessThan"')}</BlendStateTransition></BlendState1DViewModel></StateMachineLayer>
<StateMachineLayer name="Blink inspection"><EntryState x="0" y="0">${transition('0:2800','',0)}</EntryState><AnyState x="0" y="-160"/><ExitState x="240" y="-160"/><AnimationState x="200" y="0" id="0:2800" animationId="0:2700">${transition('0:2801',condition('0:46',true,true),0)}</AnimationState><AnimationState x="450" y="0" id="0:2801" animationId="0:2900" reset="true">${transition('0:2800',condition('0:46',false,true),0)}</AnimationState></StateMachineLayer></StateMachine>`;
for(const [i,[name,pose]] of Object.entries(mouthPoses).entries())animations+=`<LinearAnimation id="0:${2300+i}" name="Mouth ${name}" duration="60">${key('mouth','scaleX',[[0,pose.width]])}${key('mouth','scaleY',[[0,pose.open]])}${key('mouthTeeth','opacity',[[0,name==='closed'?0:name==='rounded'?.2:1]])}${key('mouthTongue','opacity',[[0,name==='closed'?0:1]])}</LinearAnimation>`;
const breath=[[0,1],[170,1.0025],[360,1],[540,1.0018],[780,1],[990,1.0027],[1190,1],[1420,1.002],[1620,1],[1860,1]];
const blinkFrames=[[0,92],[173,92],[178,0],[181,0],[190,92],[467,92],[472,0],[476,0],[487,92],[506,92],[511,0],[515,0],[524,92],[891,92],[896,0],[901,0],[911,92],[1123,92],[1128,0],[1133,0],[1143,92],[1497,92],[1502,0],[1506,0],[1516,92],[1860,92]];
const quiet=(off)=>['left','right'].map((side)=>key(side+'Gaze','x',off?[[0,side==='left'?637:804]]:[[0,side==='left'?637:804],[245,side==='left'?638.4:805.4],[610,side==='left'?635.8:802.8],[1040,side==='left'?637.8:804.8],[1500,side==='left'?637:804],[1860,side==='left'?637:804]])+key(side+'Earring','rotation',off?[[0,0]]:[[0,0],[375,.002],[815,-.0015],[1290,.001],[1860,0]])).join('')+key('body','scaleY',off?[[0,1]]:breath)+key('leftLongHair','rotation',off?[[0,0]]:[[0,0],[480,.0015],[920,0],[1430,-.001],[1860,0]])+key('rightLongHair','rotation',off?[[0,0]]:[[0,0],[480,-.001],[920,0],[1430,.001],[1860,0]])+['left','right'].map(s=>key(`${s}Aperture`,'height',off?[[0,92]]:blinkFrames)+key(`${s}Lid`,'opacity',off?[[0,0]]:blinkFrames.map(([f,v])=>[f,v<30?1:0]))).join('');
animations+=`<LinearAnimation id="0:2500" name="Breath and varied blinks" duration="1860" fps="60" loopValue="loop">${quiet(false)}</LinearAnimation><LinearAnimation id="0:2501" name="Still" duration="60">${quiet(true)}</LinearAnimation>`;
animations+='<LinearAnimation id="0:2700" name="No override" duration="60"/><LinearAnimation id="0:2900" name="Single blink" duration="18" fps="60">'+['left','right'].map(side=>key(side+'Aperture','height',[[0,92],[5,0],[7,0],[16,92]])+key(side+'Lid','opacity',[[0,0],[5,1],[7,1],[16,0]])).join('')+'</LinearAnimation>';
animations+='<LinearAnimation id="0:2502" name="Breathing with host blink scheduling" duration="1860" fps="60" loopValue="loop">'+quiet(false).replaceAll(/<KeyedObject objectId="(.*?)">[\s\S]*?<\/KeyedObject>/g,(match,obj)=>[ids.leftAperture,ids.rightAperture,ids.leftLid,ids.rightLid].includes(obj)?'':match)+['left','right'].map(side=>key(side+'Aperture','height',[[0,92]])+key(side+'Lid','opacity',[[0,0]])).join('')+'</LinearAnimation>';
const vm=`<ViewModel id="0:40" name="EdenControls" defaultInstanceId="0:41"><ViewModelPropertyNumber id="0:42" name="state"/><ViewModelPropertyNumber id="0:43" name="audioLevel"/><ViewModelPropertyBoolean id="0:44" name="reducedMotion"/><ViewModelPropertyNumber id="0:45" name="mouthOverride"/><ViewModelPropertyBoolean id="0:46" name="blinkNow"/><ViewModelPropertyBoolean id="0:47" name="hostBlinks"/><ViewModelInstance id="0:41" exports="true" name="Default"><ViewModelInstanceNumber viewModelPropertyId="0:42" propertyValue="0"/><ViewModelInstanceNumber viewModelPropertyId="0:43" propertyValue="0"/><ViewModelInstanceBoolean viewModelPropertyId="0:44" propertyValue="false"/><ViewModelInstanceNumber viewModelPropertyId="0:45" propertyValue="-1"/><ViewModelInstanceBoolean viewModelPropertyId="0:46" propertyValue="false"/><ViewModelInstanceBoolean viewModelPropertyId="0:47" propertyValue="false"/></ViewModelInstance></ViewModel>`;
await writeFile(new URL('scene.rml',out),`<Rive version="1" kind="fragment"><Artboard id="0:2" name="Eden" width="1254" height="1254" defaultStateMachineId="0:7" viewModelId="0:40" viewModelInstanceId="0:41" styleId="0:3"><LayoutComponentStyle id="0:3"/>${art}${machine}${animations}</Artboard>${vm}<DataConverterRangeMapper id="0:80" name="Audio to mouth blend" minInput="0" maxInput="1" minOutput="0" maxOutput="100" clampLower="true" clampUpper="true"/><DataConverterRangeMapper id="0:81" name="Mouth pose index" minInput="0" maxInput="5" minOutput="0" maxOutput="100" clampLower="true" clampUpper="true"/><ImageAsset id="0:60" file="assets/approved.png" name="Approved EDEN"/><ImageAsset id="0:61" file="assets/face-clean.png" name="Reconstructed face underlayer"/></Rive>`);
await writeFile(new URL('rive.yaml',out),'name: eden\nmain: Eden\noutput:\n  dir: build\n');
await writeFile(new URL('public/assets/eden/rig/layers.json',root),JSON.stringify({master:{width:1254,height:1254,sha256:'3684dc5bf698214170022b433f440634f2b41c6ec0a6b737ef25448097dbd871'},riveVersion:'1.9.1',layers:ids,mouthPoses,limitations:['Cardigan, cream top, neck and necklace are attached in one torso raster layer.','Pupils are the original solid dark eye shapes; no white or iris detail has been invented.','Head turn is a small planar tilt, not a three-dimensional yaw.','Clean skin underlayer reconstructed from approved image.']},null,2));
console.log('Wrote layered SVG, RML, Rive assets, and layer manifest.');
