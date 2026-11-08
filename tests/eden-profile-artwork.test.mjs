import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

// These generated assets deliberately use lossless RGBA scanlines with no
// filtering. Read and composite them independently of the artwork generator.
function pixels(bytes) {
  const parts=[];let width,height;
  for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,p+8+n);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);}if(type==='IDAT')parts.push(data);p+=12+n;}
  assert.equal(width,282);assert.equal(height,282);
  const raw=inflateSync(Buffer.concat(parts)),out=Buffer.alloc(width*height*4),stride=width*4;
  for(let y=0;y<height;y++){assert.equal(raw[y*(stride+1)],0);raw.copy(out,y*stride,y*(stride+1)+1,(y+1)*(stride+1));}return out;
}
const root=new URL('../src/eden/animation/launcher-profile/assets/',import.meta.url);

test('independent profile layers reconstruct every approved RGBA pixel at rest',async()=>{
  const source=pixels(await readFile(new URL('../public/assets/eden/approved-profile/eden-launcher.png',import.meta.url)));
  const out=Buffer.alloc(source.length);
  for(const name of ['background','body','head','eye-left','eye-right','hair-front','earring-left','earring-right']){
    const layer=pixels(await readFile(new URL(name+'.png',root)));
    for(let p=0;p<out.length;p+=4){const a=layer[p+3]/255,b=out[p+3]/255,alpha=a+b*(1-a);if(!alpha)continue;for(let c=0;c<3;c++)out[p+c]=Math.round((layer[p+c]*a+out[p+c]*b*(1-a))/alpha);out[p+3]=Math.round(alpha*255);}
  }
  assert.deepEqual(out,source);
});

test('original dark eyes are removed beneath the independently animated eye layers',async()=>{
  const head=pixels(await readFile(new URL('head.png',root)));
  for(const side of ['left','right']){
    const eye=pixels(await readFile(new URL('eye-'+side+'.png',root)));let count=0;
    for(let p=0;p<eye.length;p+=4)if(eye[p+3]&&eye[p]<65&&eye[p+1]<50&&eye[p+2]<42){count++;assert.ok(head[p]>225&&head[p+1]>130,'No original dark eye may remain beneath a moving eye.');}
    assert.ok(count>150);
  }
});

test('speech layers preserve every original head pixel at rest and remove the underlying mouth',async()=>{
  const original=pixels(await readFile(new URL('head.png',root)));
  const live=new URL('../live-assets/',root);
  const clean=pixels(await readFile(new URL('head-speaking.png',live))),mouth=pixels(await readFile(new URL('mouth.png',live)));
  const rest=Buffer.from(clean);let removed=0;
  for(let p=0;p<original.length;p+=4)if(mouth[p+3]){
    assert.equal(mouth[p+3],255);mouth.copy(rest,p,p,p+4);
    if(original[p]<220&&original[p+1]<130&&original[p+2]<115){removed++;assert.ok(clean[p]>225&&clean[p+1]>130,'The original mouth must not show underneath the moving region.');}
  }
  assert.ok(removed>200);assert.deepEqual(rest,original);
  for(const name of ['head-speaking','mouth'])assert.deepEqual(await readFile(new URL(name+'.png',live)),await readFile(new URL('../public/assets/eden/approved-profile/layers/'+name+'.png',import.meta.url)));
});

test('source eyebrow layers reconstruct both head variants exactly and remove duplicate ink beneath lifted brows',async()=>{
  const live=new URL('../live-assets/',root),layers=[];
  for(const name of['brow-skin','brow-left','brow-right','brow-fringe']){
    const bytes=await readFile(new URL(name+'.png',live));assert.deepEqual(bytes,await readFile(new URL('../public/assets/eden/approved-profile/layers/'+name+'.png',import.meta.url)));layers.push(pixels(bytes));
  }
  for(const head of[new URL('head.png',root),new URL('head-speaking.png',live)]){
    const original=pixels(await readFile(head)),rest=Buffer.from(original);
    for(const layer of layers)for(let p=0;p<rest.length;p+=4)if(layer[p+3]){assert.equal(layer[p+3],255);layer.copy(rest,p,p,p+4);}
    assert.deepEqual(rest,original);
  }
  const source=pixels(await readFile(new URL('head.png',root)));
  for(const[x,y]of[[150,115],[185,114]]){const p=(y*282+x)*4;assert.ok(source[p]<180);assert.ok(layers[0][p]>230&&layers[0][p+1]>135,'moving brows have a clean skin underlayer');}
  for(const[x,y]of[[140,114],[195,114]]){const p=(y*282+x)*4;assert.deepEqual(layers[3].subarray(p,p+4),source.subarray(p,p+4),'original fringe pixels stay fixed above the moving brows');}
});
