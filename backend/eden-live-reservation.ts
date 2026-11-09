// Compare the value as well as the key: delayed cleanup must never evict a newer call.
export const RELEASE_LIVE_RESERVATION="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
