import {readFile,writeFile} from 'node:fs/promises';
const project=new URL('../../src/eden/animation/launcher-profile/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('layers.json',project),'utf8'));
if(manifest.size!==282||manifest.restPixelDifferences!==0)throw new Error('Approved exact-rest layer manifest required');
let next=100;const ids=new Map();const id=name=>{if(!ids.has(name))ids.set(name,`0:${next++}`);return ids.get(name);};
const layerFiles={...manifest.layers,'lash-left':{file:'assets/lash-left.png'},'lash-right':{file:'assets/lash-right.png'}};
const assets=Object.fromEntries(Object.keys(layerFiles).map((name,index)=>[name,`0:${60+index}`]));
const image=name=>`<Image assetId="${assets[name]}" x="141" y="141" name="${name} approved pixels"/>`;
const group=(name,pivot,children)=>`<Node id="${id(name)}" name="${name}" x="${pivot[0]}" y="${pivot[1]}"><Node x="${-pivot[0]}" y="${-pivot[1]}" name="${name} local artwork">${[...children].reverse().join('')}</Node></Node>`;
const clip=(name,rect,body)=>`<Node name="${name} clipped"><ClippingShape sourceId="${id(name+'Shape')}"/>${body}<Shape id="${id(name+'Shape')}" name="${name} boundary"><Rectangle id="${id(name)}" originX="0" originY="0" x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}"/></Shape></Node>`;
function curve(name,start,c1,c2,end){
 const vertex=(point,incoming,outgoing)=>{const angle=p=>p?Math.atan2(p[1]-point[1],p[0]-point[0]):0,dist=p=>p?Math.hypot(p[0]-point[0],p[1]-point[1]):0;return `<CubicDetachedVertex x="${point[0]}" y="${point[1]}" inRotation="${angle(incoming)}" inDistance="${dist(incoming)}" outRotation="${angle(outgoing)}" outDistance="${dist(outgoing)}"/>`;};
 return `<Shape id="${id(name)}" name="${name}" opacity="0"><PointsPath isClosed="false">${vertex(start,null,c1)}${vertex(end,c2,null)}</PointsPath><Stroke thickness="1.5" cap="round"><SolidColor colorValue="FF17120E"/></Stroke></Shape>`;
}
function eye(side){
 const info=manifest.eyes[side],asset='eye-'+side;
 const pupil=clip(side+'PupilMask',info.pupilClip,`<Node id="${id(side+'Gaze')}" name="${side}Gaze" x="0" y="0">${image(asset)}</Node>`);
 const lash=image('lash-'+side);
 // Whole-eye aperture controls BOTH source lash and moving dark-eye patch.
 return clip(side+'Aperture',info.aperture,lash+pupil);
}
const p=manifest.pivots;
const head=group('head',p.head,[image('head'),eye('left'),eye('right'),
 curve('leftLid',[133.8,136],[140.5,140],[151.5,140],[158,135.8]),
 curve('rightLid',[177.7,135],[183.5,139],[191.5,139],[197,134.5]),
 group('hair',p.hair,[image('hair-front')]),group('leftEarring',p.leftEarring,[image('earring-left')]),group('rightEarring',p.rightEarring,[image('earring-right')])]);
const art=[image('background'),group('body',p.body,[image('body')]),head].reverse().join('');
const key=(name,property,values)=>`<KeyedObject objectId="${id(name)}"><KeyedProperty property="${property}">${values.map(([frame,value])=>`<KeyFrameDouble frame="${frame}" value="${value}" interpolationType="cubic"><CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/></KeyFrameDouble>`).join('')}</KeyedProperty></KeyedObject>`;
const bind=(prop,key)=>`<DataBindContext sourcePathIds="0:40-${prop}" propertyKey="${key}"/>`;
const condition=(property,value)=>`<TransitionViewModelCondition opValue="equal"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bind(property,634)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="${value}"/></TransitionViewModelCondition>`;
const transition=(target,conditions,duration=0)=>`<StateTransition stateToId="${target}" duration="${duration}" enableEarlyExit="true">${conditions}</StateTransition>`;
const marks=[0,220,475,730,1000,1250,1510,1750,1860];
const track=(name,property,values)=>key(name,property,marks.map((frame,index)=>[frame,values[index]]));
const motion=still=>{
 if(still)return key('head','rotation',[[0,0]])+key('head','x',[[0,p.head[0]]])+key('head','y',[[0,p.head[1]]])+key('body','scaleY',[[0,1]])+key('hair','rotation',[[0,0]])+key('leftEarring','rotation',[[0,0]])+key('rightEarring','rotation',[[0,0]])+['left','right'].map(side=>key(side+'Gaze','x',[[0,0]])+key(side+'Gaze','y',[[0,0]])).join('');
 return track('head','rotation',[0,.004,-.006,.010,.002,-.008,-.003,.004,0])
 +track('head','x',[0,.2,-.3,.5,.1,-.35,-.1,.2,0].map(value=>value+p.head[0]))
 +track('head','y',[0,-.25,-.4,0,.35,.1,-.3,-.1,0].map(value=>value+p.head[1]))
 +track('body','scaleY',[1,1.0018,1,1.0014,1,1.0018,1,1.0012,1])
 +track('hair','rotation',[0,.003,-.002,.006,.001,-.004,-.002,.002,0])
 +track('leftEarring','rotation',[0,-.008,.005,-.012,-.003,.010,.005,-.004,0])
 +track('rightEarring','rotation',[0,-.006,.004,-.010,-.001,.012,.003,-.005,0])
 +['left','right'].map(side=>track(side+'Gaze','x',[0,1.4,.1,-1.2,0,.9,-.7,.4,0])+track(side+'Gaze','y',[0,-.2,-.6,0,-.3,0,-.5,-.1,0])).join('');
};
const nativeBlinkFrames=[[0,0],[115,0],[120,1],[123,1],[132,0],[365,0],[370,1],[373,1],[382,0],[402,0],[407,1],[410,1],[419,0],[720,0],[725,1],[728,1],[737,0],[1060,0],[1065,1],[1068,1],[1077,0],[1470,0],[1475,1],[1478,1],[1487,0],[1790,0],[1795,1],[1798,1],[1807,0],[1860,0]];
const blink=frames=>['left','right'].map(side=>{
 const [,_y,,height]=manifest.eyes[side].aperture;
 return key(side+'Aperture','height',frames.map(([frame,amount])=>[frame,height*(1-amount)]))
 +key(side+'Aperture','y',frames.map(([frame,amount])=>[frame,_y+height/2*amount]))
 +key(side+'Lid','opacity',frames.map(([frame,amount])=>[frame,amount]));
}).join('');
const open=blink([[0,0]]);
const machine=`<StateMachine id="0:7" name="Eden">
<StateMachineLayer name="Launcher idle"><EntryState>${transition('0:2400','')}</EntryState><AnyState/><ExitState/>
<AnimationState id="0:2400" animationId="0:2500">${transition('0:2401',condition('0:44',true))}${transition('0:2402',condition('0:47',true))}</AnimationState>
<AnimationState id="0:2401" animationId="0:2501">${transition('0:2400',condition('0:44',false)+condition('0:47',false),180)}${transition('0:2402',condition('0:44',false)+condition('0:47',true),180)}</AnimationState>
<AnimationState id="0:2402" animationId="0:2502">${transition('0:2401',condition('0:44',true))}${transition('0:2400',condition('0:47',false),180)}</AnimationState>
</StateMachineLayer>
<StateMachineLayer name="Whole eye blink"><EntryState>${transition('0:2800','')}</EntryState><AnyState/><ExitState/>
<AnimationState id="0:2800" animationId="0:2700">${transition('0:2801',condition('0:46',true))}</AnimationState>
<AnimationState id="0:2801" animationId="0:2900" reset="true">${transition('0:2800',condition('0:46',false))}</AnimationState>
</StateMachineLayer></StateMachine>`;
const animations=`<LinearAnimation id="0:2500" name="Launcher natural idle" fps="60" duration="1860" loopValue="loop">${motion(false)}${blink(nativeBlinkFrames)}</LinearAnimation>
<LinearAnimation id="0:2501" name="Still" fps="60" duration="60">${motion(true)}${open}</LinearAnimation>
<LinearAnimation id="0:2502" name="Launcher idle with host blinks" fps="60" duration="1860" loopValue="loop">${motion(false)}${open}</LinearAnimation>
<LinearAnimation id="0:2700" name="No override" fps="60" duration="60"/>
<LinearAnimation id="0:2900" name="Single blink" fps="60" duration="18">${blink([[0,0],[5,1],[7,1],[16,0]])}</LinearAnimation>`;
const source=await readFile(new URL('../rive/scene.rml',project),'utf8');
const vm=source.match(/<ViewModel id="0:40"[\s\S]*?<\/ViewModel>/)?.[0];
if(!vm)throw new Error('Existing Eden VM contract missing');
const assetMarkup=Object.entries(layerFiles).map(([name,layer])=>`<ImageAsset id="${assets[name]}" file="${layer.file}" name="Approved profile ${name}"/>`).join('');
await writeFile(new URL('scene.rml',project),`<Rive version="1" kind="fragment"><Artboard id="0:2" name="Eden" width="282" height="282" defaultStateMachineId="0:7" viewModelId="0:40" viewModelInstanceId="0:41"><LayoutComponentStyle/>${art}${machine}${animations}</Artboard>${vm}${assetMarkup}</Rive>\n`);
await writeFile(new URL('rive.yaml',project),'name: eden-launcher\nmain: Eden\nalwaysWatermark: true\noutput:\n  dir: build\n');
console.log('Built launcher-only RML; approved layers and conversation rig were not modified.');
