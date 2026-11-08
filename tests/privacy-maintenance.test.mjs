import assert from 'node:assert/strict';
import test from 'node:test';
import {retentionBatchOptions} from '../backend/privacy-maintenance.mjs';
test('owner retention defaults to one bounded batch and permits lower explicit per-category/total caps',()=>{
  assert.deepEqual(retentionBatchOptions([]),{batchSize:100,totalLimit:500});
  assert.deepEqual(retentionBatchOptions(['--batch-size','2','--total-limit','3']),{batchSize:2,totalLimit:3});
  assert.deepEqual(retentionBatchOptions([],{PRIVACY_RETENTION_BATCH_SIZE:'20',PRIVACY_RETENTION_TOTAL_LIMIT:'25'}),{batchSize:20,totalLimit:25});
});
test('owner retention rejects unlimited, repeated, malformed or unsupported options',()=>{
  for(const args of [['--all'],['--batch-size'],['--batch-size','0'],['--batch-size','1001'],['--total-limit','5001'],['--total-limit','1.5'],['--total-limit','Infinity'],['--apply','--apply'],['--batch-size','1','--batch-size','2']])assert.throws(()=>retentionBatchOptions(args));
  assert.throws(()=>retentionBatchOptions([],{PRIVACY_RETENTION_BATCH_SIZE:'-1'}));
});
