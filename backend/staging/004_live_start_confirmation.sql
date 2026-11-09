-- Same atomic two-permit transition as CONFIRM_LIVE_START on Redis.
-- No general write/read grant, and no change to existing ticket lifetimes.
SET LOCAL ROLE eden_staging_limiter_owner;
CREATE FUNCTION eden_staging_limits.live_confirm(a text, b text, who text, seconds integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE vals text[];
BEGIN
  IF a IS NULL OR b IS NULL OR a=b OR a !~ '^[a-f0-9]{64}$' OR b !~ '^[a-f0-9]{64}$'
    OR who IS NULL OR who !~ '^[A-Za-z0-9_-]{43}$' OR seconds IS NULL OR seconds NOT BETWEEN 1 AND 86500 THEN
    RAISE EXCEPTION 'Invalid Live confirmation' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(q.v) INTO vals FROM (SELECT t.v FROM eden_staging_limits.eden_ticket t
    WHERE t.k IN (a,b) AND t.expires>clock_timestamp() ORDER BY t.k FOR UPDATE) q;
  IF cardinality(vals) IS DISTINCT FROM 2 THEN RETURN 0; END IF;
  IF vals[1]='ready:'||who AND vals[2]='ready:'||who THEN RETURN 1; END IF;
  IF vals[1]<>who OR vals[2]<>who THEN RETURN 0; END IF;
  UPDATE eden_staging_limits.eden_ticket SET v='ready:'||who,expires=clock_timestamp()+make_interval(secs=>seconds) WHERE k IN (a,b);
  RETURN 1;
END;
$body$;
REVOKE ALL ON FUNCTION eden_staging_limits.live_confirm(text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION eden_staging_limits.live_confirm(text,text,text,integer) TO our_ground_api;
RESET ROLE;
