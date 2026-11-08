import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
// Isolated source-pixel decomposition. Existing approved and Rive assets remain
// byte-identical; the same small skin patch covers brows in both head variants.
const root='src/eden/animation/launcher-profile/',W=282,N=W*W,stride=W*4;
function decode(path){const bytes=fs.readFileSync(path),chunks=[];for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p);chunks.push({type:bytes.toString('ascii',p+4,p+8),data:bytes.subarray(p+8,p+8+n)});p+=n+12;}const ihdr=chunks.find(c=>c.type==='IHDR').data;if(ihdr.readUInt32BE(0)!==W||ihdr.readUInt32BE(4)!==W||ihdr[9]!==6)throw Error('Expected original RGBA head.');const raw=zlib.inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data))),pixels=Buffer.alloc(N*4);for(let y=0;y<W;y++){if(raw[y*(stride+1)]!==0)throw Error('Expected unfiltered source head.');raw.copy(pixels,y*stride,y*(stride+1)+1,(y+1)*(stride+1));}return{bytes,chunks,ihdr,pixels};}
const source=decode(root+'assets/head.png'),pixels=source.pixels;
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(type,data){const payload=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);payload.copy(out,4);let crc=0xffffffff;for(const b of payload)crc=crcTable[(crc^b)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;}
function encode(data){const rows=Buffer.alloc(W*(stride+1));for(let y=0;y<W;y++)data.copy(rows,y*(stride+1)+1,y*stride,(y+1)*stride);return Buffer.concat([source.bytes.subarray(0,8),chunk('IHDR',source.ihdr),...source.chunks.filter(c=>['sRGB','gAMA','iCCP','cHRM','pHYs'].includes(c.type)).map(c=>chunk(c.type,c.data)),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const dilation=(mask,r)=>{const out=mask.slice();for(let i=0;i<N;i++)if(mask[i]){const x=i%W,y=Math.floor(i/W);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<W)out[(y+dy)*W+x+dx]=1;}return out;};
function brow(seed,roi){const mask=new Uint8Array(N),queue=[seed[1]*W+seed[0]];for(let k=0;k<queue.length;k++){const i=queue[k],x=i%W,y=Math.floor(i/W),p=i*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2];if(mask[i]||x<roi[0]||x>=roi[2]||y<roi[1]||y>=roi[3]||r<=85||r>=180||g>=115||b>=95||r-g<35||g-b<12)continue;mask[i]=1;queue.push(i-1,i+1,i-W,i+W);}if(mask.reduce((a,b)=>a+b,0)<80)throw Error('Original brow component missing.');return dilation(mask,2);}
const left=brow([150,115],[138,108,165,124]),right=brow([185,114],[172,107,197,123]);
const mask=Uint8Array.from(left,(v,i)=>v||right[i]?1:0),skin=Buffer.alloc(N*4),occlusionMask=new Uint8Array(N);
for(let y=104;y<128;y++)for(let x=133;x<205;x++){const p=(y*W+x)*4;if(x<=140||x>=194||pixels[p]<86&&pixels[p+1]<65&&pixels[p+2]<60)occlusionMask[y*W+x]=1;}
const fringe=dilation(occlusionMask,1),fixed=Buffer.alloc(N*4);
for(let i=0;i<N;i++)if(fringe[i])pixels.copy(fixed,i*4,i*4,i*4+4);
// Fit the local skin gradient with weighted nearby original skin samples.
for(let i=0;i<N;i++)if(mask[i]){const x=i%W,y=Math.floor(i/W),neighbors=[];for(let dy=-12;dy<=12;dy++)for(let dx=-14;dx<=14;dx++){const sx=x+dx,sy=y+dy,j=sy*W+sx,p=j*4;if(sx<0||sx>=W||sy<0||sy>=W||mask[j]||fringe[j]||pixels[p]<=230||pixels[p+1]<=135||pixels[p+1]>=195||pixels[p+2]<=75||pixels[p+2]>=150)continue;neighbors.push({p,w:1/(1+dx*dx+dy*dy)});}if(!neighbors.length)throw Error('Brow skin context missing.');const weight=neighbors.reduce((sum,n)=>sum+n.w,0);for(let c=0;c<3;c++)skin[i*4+c]=Math.round(neighbors.reduce((sum,n)=>sum+pixels[n.p+c]*n.w,0)/weight);skin[i*4+3]=pixels[i*4+3];}
function extract(mask){const out=Buffer.alloc(N*4);for(let i=0;i<N;i++)if(mask[i])pixels.copy(out,i*4,i*4,i*4+4);return out;}
const layers={'brow-skin':skin,'brow-left':extract(left),'brow-right':extract(right),'brow-fringe':fixed};
const variants=[source,decode(root+'live-assets/head-speaking.png')],differences=[];
for(const variant of variants){const rest=Buffer.from(variant.pixels);for(const layer of Object.values(layers))for(let i=0;i<N;i++)if(layer[i*4+3])layer.copy(rest,i*4,i*4,i*4+4);let count=0;for(let i=0;i<rest.length;i++)if(rest[i]!==variant.pixels[i])count++;differences.push(count);if(count)throw Error('Neutral brow reconstruction changed original pixels.');}
fs.mkdirSync(root+'live-assets',{recursive:true});for(const[name,layer]of Object.entries(layers)){const bytes=encode(layer);fs.writeFileSync(root+'live-assets/'+name+'.png',bytes);fs.writeFileSync('public/assets/eden/approved-profile/layers/'+name+'.png',bytes);}
const manifest={sourceHeadSha256:crypto.createHash('sha256').update(source.bytes).digest('hex'),restPixelDifferences:{head:differences[0],headSpeaking:differences[1]},movement:{leftMaxLift:.7,rightMaxLift:.6},layers:Object.keys(layers)};
fs.writeFileSync(root+'live-assets/brows.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
