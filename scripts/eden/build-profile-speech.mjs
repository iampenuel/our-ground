import fs from 'node:fs';
import zlib from 'node:zlib';
// Derive a movable mouth from the approved source. Neither the original portrait
// nor any existing Rive/reference layer is changed by this build step.
const root='src/eden/animation/launcher-profile/',bytes=fs.readFileSync(root+'assets/head.png');
const size=282,stride=size*4,chunks=[];
for(let pos=8;pos<bytes.length;){const n=bytes.readUInt32BE(pos);chunks.push({type:bytes.toString('ascii',pos+4,pos+8),data:bytes.subarray(pos+8,pos+8+n)});pos+=n+12;}
const ihdr=chunks.find(c=>c.type==='IHDR').data;
if(ihdr.readUInt32BE(0)!==size||ihdr.readUInt32BE(4)!==size||ihdr[9]!==6)throw Error('Expected approved RGBA profile.');
const raw=zlib.inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data))),pixels=Buffer.alloc(size*stride);
for(let y=0;y<size;y++){if(raw[y*(stride+1)]!==0)throw Error('Expected lossless unfiltered source layer.');raw.copy(pixels,y*stride,y*(stride+1)+1,(y+1)*(stride+1));}
const count=size*size,mask=new Uint8Array(count),queue=[176*size+166];
for(let k=0;k<queue.length;k++){const i=queue[k],x=i%size,y=Math.floor(i/size),p=i*4;if(mask[i]||x<146||x>183||y<162||y>183||pixels[p]>=220||pixels[p+1]>=130||pixels[p+2]>=115)continue;mask[i]=1;queue.push(i-1,i+1,i-size,i+size);}
if(mask.reduce((a,b)=>a+b,0)<200)throw Error('Approved mouth component missing.');
// Fill the teeth enclosed by the original lip, then retain antialias pixels.
const outside=new Uint8Array(count),flood=[];
for(let y=160;y<=186;y++)for(let x=144;x<=186;x++)if(x===144||x===186||y===160||y===186)flood.push(y*size+x);
for(let k=0;k<flood.length;k++){const i=flood[k],x=i%size,y=Math.floor(i/size);if(outside[i]||mask[i]||x<144||x>186||y<160||y>186)continue;outside[i]=1;flood.push(i-1,i+1,i-size,i+size);}
for(let y=160;y<=186;y++)for(let x=144;x<=186;x++)if(!outside[y*size+x])mask[y*size+x]=1;
const full=mask.slice();for(let i=0;i<count;i++)if(mask[i])for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)full[i+dy*size+dx]=1;
const clean=Buffer.from(pixels),mouth=Buffer.alloc(pixels.length);
// Estimate only the newly exposed skin from the immediately adjacent skin.
for(let i=0;i<count;i++)if(full[i]){pixels.copy(mouth,i*4,i*4,i*4+4);const x=i%size,y=Math.floor(i/size),neighbors=[];
  for(let dy=-16;dy<=16;dy++)for(let dx=-16;dx<=16;dx++){const j=(y+dy)*size+x+dx,p=j*4;if(!full[j]&&pixels[p]>225&&pixels[p+1]>130&&pixels[p+1]<190&&pixels[p+2]>75&&pixels[p+2]<140)neighbors.push({p,w:1/(1+dx*dx+dy*dy)});}
  if(!neighbors.length)throw Error('Adjacent source skin missing.');const weight=neighbors.reduce((s,n)=>s+n.w,0);for(let c=0;c<3;c++)clean[i*4+c]=Math.round(neighbors.reduce((s,n)=>s+pixels[n.p+c]*n.w,0)/weight);
}
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(type,data){const payload=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);payload.copy(out,4);let c=0xffffffff;for(const b of payload)c=table[(c^b)&255]^(c>>>8);out.writeUInt32BE((c^0xffffffff)>>>0,out.length-4);return out;}
function png(data){const rows=Buffer.alloc(size*(stride+1));for(let y=0;y<size;y++)data.copy(rows,y*(stride+1)+1,y*stride,(y+1)*stride);return Buffer.concat([bytes.subarray(0,8),chunk('IHDR',ihdr),...chunks.filter(c=>['sRGB','gAMA','pHYs'].includes(c.type)).map(c=>chunk(c.type,c.data)),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
fs.mkdirSync(root+'live-assets',{recursive:true});
for(const[name,data]of[['head-speaking',clean],['mouth',mouth]]){const encoded=png(data);fs.writeFileSync(root+'live-assets/'+name+'.png',encoded);fs.writeFileSync('public/assets/eden/approved-profile/layers/'+name+'.png',encoded);}
// The untransformed speech layers must restore the source exactly.
for(let p=0;p<pixels.length;p++)if((mouth[(p>>2)*4+3]?mouth[p]:clean[p])!==pixels[p])throw Error('Speech rest must reproduce the approved source.');
console.log('Built two source-derived speech layers; original portrait and reference layers unchanged.');
