import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../docs/eden/verification/',import.meta.url);
const states=['idle','listening','thinking','searching','speaking-quiet','speaking-open','speaking-rounded','success','clarifying','unable','blink','blink-open','reduced-a','reduced-b'];
const hashes={};for(const s of states){const bytes=await readFile(new URL(`native-${s}.png`,root));assert.equal(bytes.subarray(1,4).toString(),'PNG');hashes[s]=createHash('sha256').update(bytes).digest('hex');}
assert.equal(new Set(states.slice(0,10).map(s=>hashes[s])).size,10,'All requested expression/speech renders must be visibly distinct');
assert.notEqual(hashes.blink,hashes['blink-open']);
assert.equal(hashes['reduced-a'],hashes['reduced-b'],'Reduced motion should remain pixel-identical over time');
const verify=JSON.parse(await readFile(new URL('rive-verify.json',root),'utf8'));
const exported=JSON.parse(await readFile(new URL('rive-export.json',root),'utf8'));
assert.equal(verify.success,true);assert.equal(exported.success,true);assert.deepEqual(verify.errors,[]);
await writeFile(new URL('render-checks.json',root),JSON.stringify({passed:true,nativeRenders:states.length,expressionAndAudioVariants:10,blinkChangesPixels:true,reducedMotionPixelIdentical:true,hashes},null,2)+'\n');
console.log('14 native captures checked: distinct expressions/audio, actual blink, identical reduced-motion frames.');
