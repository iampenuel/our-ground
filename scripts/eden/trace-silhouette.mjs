// Read the approved RGB PNG and trace a vector clipping contour. Never edits pixels
// or writes a replacement raster. The original cream shirt is protected by flood fill.
import {readFile,writeFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
const root=new URL('../../',import.meta.url),png=await readFile(new URL('public/assets/eden/approved-original/eden.png',root));
const w=png.readUInt32BE(16),h=png.readUInt32BE(20),channels=png[25]===2?3:4;
if(png[24]!==8||![2,6].includes(png[25])||png[28]!==0)throw Error('Expected non-interlaced 8-bit RGB(A) PNG.');
const chunks=[];for(let p=8;p<png.length;){const n=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8);if(type==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=n+12;}
const data=inflateSync(Buffer.concat(chunks)),stride=w*channels,pixels=new Uint8Array(w*h*channels);
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
for(let y=0;y<h;y++){const type=data[y*(stride+1)],offset=y*stride;for(let x=0;x<stride;x++){const a=x>=channels?pixels[offset+x-channels]:0,b=y?pixels[offset-stride+x]:0,c=y&&x>=channels?pixels[offset-stride+x-channels]:0;pixels[offset+x]=(data[y*(stride+1)+x+1]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][type])&255;}}
const exterior=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
const add=i=>{if(i<0||i>=w*h||exterior[i])return;const p=i*channels;if(pixels[p]>224&&pixels[p+1]>201&&pixels[p+2]>177){exterior[i]=1;queue[tail++]=i;}};
for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
while(head<tail){const i=queue[head++],x=i%w;if(x)add(i-1);if(x<w-1)add(i+1);add(i-w);add(i+w);}
const edges=new Map(),key=(x,y)=>y*(w+1)+x;
const edge=(x,y,a,b)=>{const k=key(x,y),v=key(a,b);if(!edges.has(k))edges.set(k,[]);edges.get(k).push(v);};
for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(exterior[y*w+x])continue;if(!y||exterior[(y-1)*w+x])edge(x,y,x+1,y);if(x===w-1||exterior[y*w+x+1])edge(x+1,y,x+1,y+1);if(y===h-1||exterior[(y+1)*w+x])edge(x+1,y+1,x,y+1);if(!x||exterior[y*w+x-1])edge(x,y+1,x,y);}
const loops=[];while(edges.size){let start=edges.keys().next().value,at=start,loop=[];do{loop.push([at%(w+1),Math.floor(at/(w+1))]);const next=edges.get(at);if(!next?.length)break;const n=next.pop();if(!next.length)edges.delete(at);at=n;}while(at!==start&&loop.length<w*h);if(loop.length>20)loops.push(loop);}
const poly=loops.sort((a,b)=>b.length-a.length)[0];
function simplify(points,epsilon){if(points.length<=2)return points;const [a,b]=[points[0],points.at(-1)],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;let max=0,at=0;for(let i=1;i<points.length-1;i++){const p=points[i],t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0,d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>max){max=d;at=i;}}return max>epsilon?[...simplify(points.slice(0,at+1),epsilon).slice(0,-1),...simplify(points.slice(at),epsilon)]:[a,b];}
const mid=Math.floor(poly.length/2),simple=[...simplify(poly.slice(0,mid+1),.65).slice(0,-1),...simplify([...poly.slice(mid),poly[0]],.65).slice(0,-1)];
await writeFile(new URL('public/assets/eden/rig/silhouette.json',root),JSON.stringify({source:'Approved original PNG; exterior cream flood fill, vector contour only',d:'M '+simple.map(p=>p.join(' ')).join(' L ')+' Z'},null,2));
console.log(`Traced ${simple.length} vector vertices; original raster unchanged.`);
