/** One explicit owner batch per command. No scheduler, loop or unbounded fallback. */
export function retentionBatchOptions(args, env = {}) {
  const allowed = new Set(['--apply','--reviewer','--batch-size','--total-limit']);
  for(let i=0;i<args.length;i++) {
    const flag=args[i];
    if(!allowed.has(flag)||args.filter(value=>value===flag).length!==1)throw Error('Unknown or repeated retention option.');
    if(flag!=='--apply') {if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing retention option value.');i++;}
  }
  const number = (flag, name, fallback, max) => {
    const i=args.indexOf(flag),value=i<0?String(env[name]??fallback):args[i+1];
    if(!/^[1-9]\d*$/.test(value)||Number(value)>max)throw Error('Retention batch limits must be positive bounded integers.');
    return Number(value);
  };
  return {batchSize:number('--batch-size','PRIVACY_RETENTION_BATCH_SIZE',100,1000),totalLimit:number('--total-limit','PRIVACY_RETENTION_TOTAL_LIMIT',500,5000)};
}
