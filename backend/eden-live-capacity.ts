// Hosted call admission. Counts logical starts separately from attempts
// that can create a non-revocable Google credential. Never infer concurrency
// from the "Unlimited" request dimensions in AI Studio.
export type LiveCapacity={teamStarts:number;testerStarts:number;teamAttempts:number;testerAttempts:number;seats:number};
export function liveCapacity(env:Record<string,string|undefined>):LiveCapacity|null {
  const read=(key:string,fallback:number,max:number)=>{
    const raw=env['EDEN_LIVE_'+key];return raw===undefined?(env.VERCEL_ENV==='production'?NaN:fallback):/^[1-9]\d*$/.test(raw)&&Number(raw)<=max?Number(raw):NaN;
  };
  const policy={teamStarts:read('TEAM_STARTS_PER_DAY',24,48),testerStarts:read('TESTER_STARTS_PER_DAY',6,12),
    teamAttempts:read('PROVIDER_ATTEMPTS_PER_DAY',32,60),testerAttempts:read('TESTER_ATTEMPTS_PER_DAY',8,16),seats:read('PROVIDER_SEATS',2,2)};
  return Object.values(policy).every(Number.isSafeInteger)&&policy.testerStarts<=policy.teamStarts&&policy.teamStarts<=policy.teamAttempts&&policy.testerStarts<=policy.testerAttempts&&policy.testerAttempts<=policy.teamAttempts?policy:null;
}
// Each tentative permit expires if a tab disappears before setup. Promote both
// together after setup; stale end requests can only remove a still-pending permit.
export const CONFIRM_LIVE_START=`
local a=redis.call('GET',KEYS[1]); local b=redis.call('GET',KEYS[2]);
local ready='ready:'..ARGV[1];
if a==ready and b==ready then return 1 end;
if a~=ARGV[1] or b~=ARGV[1] then return 0 end;
redis.call('SET',KEYS[1],ready,'EX',ARGV[2]); redis.call('SET',KEYS[2],ready,'EX',ARGV[2]); return 1`;
