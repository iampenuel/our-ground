import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const source='public/assets/eden/approved-profile/eden-launcher.png';
const bytes=fs.readFileSync(source),chunks=[];
for(let pos=8;pos<bytes.length;){const size=bytes.readUInt32BE(pos),type=bytes.toString('ascii',pos+4,pos+8);chunks.push({type,data:bytes.subarray(pos+8,pos+8+size)});pos+=size+12;}
const ihdr=chunks.find(c=>c.type==='IHDR').data,W=ihdr.readUInt32BE(0),H=ihdr.readUInt32BE(4),N=W*H;
if(W!==282||H!==282||ihdr[8]!==8||ihdr[9]!==6||ihdr[12]!==0)throw new Error('Expected the approved 282px RGBA portrait.');
const raw=zlib.inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data))),pixels=Buffer.alloc(N*4),stride=W*4;
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
let offset=0;
for(let y=0;y<H;y++){const filter=raw[offset++];for(let x=0;x<stride;x++){const a=x>=4?pixels[y*stride+x-4]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=4?pixels[(y-1)*stride+x-4]:0;pixels[y*stride+x]=(raw[offset++]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(type,data){const name=Buffer.from(type),payload=Buffer.concat([name,data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);payload.copy(out,4);let crc=0xffffffff;for(const byte of payload)crc=crcTable[(crc^byte)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;}
function encode(data){const filtered=Buffer.alloc(H*(stride+1));for(let y=0;y<H;y++)data.copy(filtered,y*(stride+1)+1,y*stride,(y+1)*stride);return Buffer.concat([bytes.subarray(0,8),chunk('IHDR',ihdr),...chunks.filter(c=>['sRGB','gAMA','iCCP','cHRM','pHYs'].includes(c.type)).map(c=>chunk(c.type,c.data)),chunk('IDAT',zlib.deflateSync(filtered,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const out='src/eden/animation/launcher-profile/assets';fs.mkdirSync(out,{recursive:true});
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
if(hash(bytes)!=='d9638364ebe98f041a4011ee7625debac1f6fc708122018325918d7d6e409326')throw new Error('Approved profile changed.');
const xy=i=>[i%W,Math.floor(i/W)];
function inside(x,y,poly){let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)result=!result;}return result;}
function dilate(mask,r=1){const result=mask.slice();for(let i=0;i<N;i++)if(mask[i]){const[x,y]=xy(i);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<H)result[(y+dy)*W+x+dx]=1;}return result;}
function component(seed,roi,predicate){const mask=new Uint8Array(N),queue=[seed[1]*W+seed[0]];for(let q=0;q<queue.length;q++){const i=queue[q],[x,y]=xy(i);if(mask[i]||x<roi[0]||x>=roi[2]||y<roi[1]||y>=roi[3]||!predicate(i))continue;mask[i]=1;for(const j of [i-1,i+1,i-W,i+W])if(j>=0&&j<N)queue.push(j);}return mask;}
// Exterior cream is connected; the enclosed cream shirt and teeth remain part
// of the character. No new silhouette or replacement illustration is drawn.
const exterior=new Uint8Array(N),queue=[];for(let i=0;i<N;i++)if(!pixels[i*4+3]){exterior[i]=1;queue.push(i);}
const isCream=i=>pixels[i*4]>225&&pixels[i*4+1]>209&&pixels[i*4+2]>190;
for(let q=0;q<queue.length;q++){const i=queue[q],[x,y]=xy(i);for(const j of [x?i-1:-1,x<W-1?i+1:-1,y?i-W:-1,y<H-1?i+W:-1])if(j>=0&&!exterior[j]&&(pixels[j*4+3]===0||isCream(j))){exterior[j]=1;queue.push(j);}}
const person=Uint8Array.from(exterior,(value,i)=>!value&&pixels[i*4+3]?1:0);
const headPoly=[[40,20],[240,20],[240,182],[215,187],[190,179],[175,194],[165,201],[165,217],[154,223],[125,215],[124,188],[105,182],[90,180],[81,165],[73,151],[73,134],[65,125],[46,120]];
const headMask=Uint8Array.from(person,(value,i)=>{const[x,y]=xy(i);return value&&inside(x+.5,y+.5,headPoly)?1:0;});
const bodyMask=Uint8Array.from(person,(value,i)=>value&&!headMask[i]?1:0),bodyBleed=dilate(bodyMask,3);
for(let i=0;i<N;i++)bodyMask[i]=person[i]&&bodyBleed[i]?1:0;
const dark=i=>pixels[i*4]<65&&pixels[i*4+1]<50&&pixels[i*4+2]<42;
const leftEye=dilate(component([149,138],[132,128,161,147],dark),2),rightEye=dilate(component([184,137],[176,127,200,146],dark),2);
for(let i=0;i<N;i++){const[x,y]=xy(i);if(x>=200)rightEye[i]=0;if(!headMask[i]){leftEye[i]=0;rightEye[i]=0;}}
const hairPoly=[[119,70],[154,75],[140,104],[133,129],[120,147],[120,163],[126,173],[117,171],[109,160],[104,146],[107,132],[115,113]];
const hairMask=Uint8Array.from(headMask,(value,i)=>{const[x,y]=xy(i);return value&&inside(x+.5,y+.5,hairPoly)&&!(x>=136&&x<=164&&y>=107&&y<=125)&&pixels[i*4]<135&&pixels[i*4+1]<95&&pixels[i*4+2]<85?1:0;});
const gold=i=>pixels[i*4]>185&&pixels[i*4+1]>105&&pixels[i*4+2]<90&&pixels[i*4+1]-pixels[i*4+2]>35;
let leftHoop=component([108,166],[97,163,121,188],gold),rightHoop=component([204,169],[192,164,212,188],gold);
if(!leftHoop.some(Boolean)||!rightHoop.some(Boolean))throw new Error('Approved hoop component not found.');
leftHoop=dilate(leftHoop,2);rightHoop=dilate(rightHoop,2);
for(let i=0;i<N;i++){const[,y]=xy(i);if(!headMask[i]||y<163)leftHoop[i]=0;if(!headMask[i]||y<164)rightHoop[i]=0;}
const features=[leftEye,rightEye,hairMask,leftHoop,rightHoop],featureMask=Uint8Array.from(headMask,(_,i)=>features.some(mask=>mask[i])?1:0);
function layer(mask,data=pixels){const result=Buffer.alloc(N*4);for(let i=0;i<N;i++)if(mask[i])data.copy(result,i*4,i*4,i*4+4);return result;}
function solve3(matrix,values){const a=matrix.map((r,i)=>[...r,values[i]]);for(let k=0;k<3;k++){let pivot=k;for(let j=k+1;j<3;j++)if(Math.abs(a[j][k])>Math.abs(a[pivot][k]))pivot=j;[a[k],a[pivot]]=[a[pivot],a[k]];const d=a[k][k];if(Math.abs(d)<1e-8)return[values[0]/matrix[0][0],0,0];for(let x=k;x<4;x++)a[k][x]/=d;for(let y=0;y<3;y++)if(y!==k){const f=a[y][k];for(let x=k;x<4;x++)a[y][x]-=f*a[k][x];}}return a.map(row=>row[3]);}
function skinPlane(mask,roi){const sums=Array.from({length:3},()=>[0,0,0]),values=Array.from({length:3},()=>[0,0,0]);for(let y=roi[1];y<roi[3];y++)for(let x=roi[0];x<roi[2];x++){const i=y*W+x,r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2];if(mask[i]||r<=225||g<=130||g>=190||b<=75||b>=140)continue;const v=[1,x,y];for(let a=0;a<3;a++){for(let c=0;c<3;c++)sums[a][c]+=v[a]*v[c];for(let c=0;c<3;c++)values[c][a]+=pixels[i*4+c]*v[a];}}return values.map(value=>solve3(sums,value));}
const clean=Buffer.from(pixels);
for(const[mask,roi]of[[leftEye,[127,123,165,151]],[rightEye,[173,123,202,150]]]){const fit=skinPlane(mask,roi);for(let i=0;i<N;i++)if(mask[i]){const[x,y]=xy(i);for(let c=0;c<3;c++)clean[i*4+c]=Math.max(0,Math.min(255,Math.round(fit[c][0]+fit[c][1]*x+fit[c][2]*y)));}}
// Only the newly exposed boundary of secondary pieces needs reconstruction;
// their original pixels remain opaque over the hidden interior at every pose.
for(const mask of[hairMask,leftHoop,rightHoop]){let known=new Uint8Array(N);for(let i=0;i<N;i++)known[i]=!mask[i]?1:0;for(let pass=0;pass<4;pass++){const next=known.slice();for(let i=0;i<N;i++)if(mask[i]&&!known[i]){const[x,y]=xy(i),neighbors=[x?i-1:-1,x<W-1?i+1:-1,y?i-W:-1,y<H-1?i+W:-1].filter(j=>j>=0&&known[j]);if(neighbors.length){for(let c=0;c<3;c++)clean[i*4+c]=Math.round(neighbors.reduce((s,j)=>s+clean[j*4+c],0)/neighbors.length);next[i]=1;}}known=next;}}
// The fixed circular background keeps every original exterior pixel. Only
// occluded character pixels receive nearby cream; opaque artwork covers them.
const background=Buffer.from(pixels);for(let i=0;i<N;i++)if(person[i]){const[x,y]=xy(i);if(pixels[i*4+3]<255){background.fill(0,i*4,i*4+4);continue;}const sampleY=Math.max(0,Math.min(H-1,y)),sampleX=x<141?Math.max(0,Math.round(141-Math.sqrt(Math.max(0,140**2-(sampleY-141)**2))+3)):Math.min(W-1,Math.round(141+Math.sqrt(Math.max(0,140**2-(sampleY-141)**2))-3));const j=sampleY*W+sampleX;for(let c=0;c<3;c++)background[i*4+c]=isCream(j)?pixels[j*4+c]:[255,246,235][c];background[i*4+3]=255;}
const layers={background,body:layer(bodyMask),head:layer(headMask,clean),'eye-left':layer(leftEye),'eye-right':layer(rightEye),'hair-front':layer(hairMask),'earring-left':layer(leftHoop),'earring-right':layer(rightHoop)};
for(const[name,data]of Object.entries(layers))fs.writeFileSync(out+'/'+name+'.png',encode(data));
// Fixed lash artwork owns all source pixels outside the moving pupil window;
// this includes antialias fringes at the lash tips, preserving the exact rest pose.
for(const[name,mask,clip,split]of[['left',leftEye,[140,133,22,14],135],['right',rightEye,[176,132,19,15],134]]){const fixed=Uint8Array.from(mask,(v,i)=>{const[x,y]=xy(i);return v&&!(x>=clip[0]&&x<clip[0]+clip[2]&&y>=split&&y<clip[1]+clip[3])?1:0;});fs.writeFileSync(out+'/lash-'+name+'.png',encode(layer(fixed)));}
fs.copyFileSync(source,out+'/approved.png');
const assembled=Buffer.alloc(N*4);for(const data of Object.values(layers))for(let i=0;i<N;i++){const a=data[i*4+3]/255,ba=assembled[i*4+3]/255,oa=a+ba*(1-a);if(!oa)continue;for(let c=0;c<3;c++)assembled[i*4+c]=Math.round((data[i*4+c]*a+assembled[i*4+c]*ba*(1-a))/oa);assembled[i*4+3]=Math.round(oa*255);}
let differences=0;for(let i=0;i<pixels.length;i++)if(assembled[i]!==pixels[i])differences++;
fs.writeFileSync('/tmp/eden-profile-rig-rest.png',encode(assembled));
const manifest={sourceSha256:hash(bytes),size:282,restPixelDifferences:differences,pivots:{head:[151,214],body:[143,282],hair:[140,94],leftEarring:[108,163],rightEarring:[200,164]},layers:Object.fromEntries(Object.entries(layers).map(([name,data])=>[name,{file:'assets/'+name+'.png',pixels:Array.from({length:N},(_,i)=>data[i*4+3]>0?1:0).reduce((a,b)=>a+b,0)}])),eyes:{left:{aperture:[131,127,31,20],pupilClip:[140,133,22,14],lashClip:[0,0,282,135]},right:{aperture:[175,126,26,20],pupilClip:[176,132,19,15],lashClip:[0,0,282,134]}}};
fs.writeFileSync('src/eden/animation/launcher-profile/layers.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({size:282,restPixelDifferences:differences,layers:manifest.layers}));
if(differences)throw new Error('Rest composition must reproduce the exact approved RGBA portrait.');
