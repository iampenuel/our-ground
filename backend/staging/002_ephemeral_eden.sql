-- Protected staging only; no grants to browser identities or the production project.
SET LOCAL ROLE eden_staging_limiter_owner;
CREATE TABLE eden_staging_limits.eden_ticket (
  k text PRIMARY KEY CHECK (length(k)=64), v text NOT NULL CHECK (octet_length(v)<=32768), expires timestamptz NOT NULL
);
ALTER TABLE eden_staging_limits.eden_ticket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE eden_staging_limits.eden_ticket FROM PUBLIC,anon,authenticated,service_role,our_ground_api;
CREATE INDEX eden_ticket_expiry ON eden_staging_limits.eden_ticket(expires);

CREATE FUNCTION eden_staging_limits.eden_op(op text, digest text, value text, ttl int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE reply text; t timestamptz:=clock_timestamp();
BEGIN
  IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR ttl IS NULL OR value IS NULL OR octet_length(value)>32768 OR op IS NULL OR op NOT IN ('GET','GETDEL','DEL','SET','COUNT')
    OR (op='SET' AND ttl NOT BETWEEN 1 AND 900) OR (op='COUNT' AND ttl NOT BETWEEN 1 AND 86500) THEN
    RAISE EXCEPTION 'Invalid Eden operation' USING ERRCODE='22023';
  END IF;
  IF op='GET' THEN
    SELECT v INTO reply FROM eden_staging_limits.eden_ticket WHERE k=digest AND expires>t;
  ELSIF op IN ('DEL','GETDEL') THEN
    DELETE FROM eden_staging_limits.eden_ticket WHERE k=digest AND expires>t RETURNING v INTO reply;
  ELSIF op='SET' THEN
    INSERT INTO eden_staging_limits.eden_ticket AS row(k,v,expires) VALUES(digest,value,t+make_interval(secs=>ttl))
    ON CONFLICT(k) DO UPDATE SET v=excluded.v,expires=excluded.expires WHERE row.expires<=t RETURNING 'OK' INTO reply;
  ELSE
    INSERT INTO eden_staging_limits.eden_ticket AS row(k,v,expires) VALUES(digest,'1',t+make_interval(secs=>ttl))
    ON CONFLICT(k) DO UPDATE SET v=CASE WHEN row.expires<=t THEN '1' ELSE (row.v::integer+1)::text END,
      expires=CASE WHEN row.expires<=t THEN excluded.expires ELSE row.expires END RETURNING v INTO reply;
  END IF;
  RETURN reply;
END;
$body$;
REVOKE ALL ON FUNCTION eden_staging_limits.eden_op(text,text,text,int) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION eden_staging_limits.eden_op(text,text,text,int) TO our_ground_api;
RESET ROLE;
SELECT cron.schedule('eden-recovery-ticket-purge','*/5 * * * *',$job$
 DELETE FROM eden_staging_limits.eden_ticket WHERE expires<=now();
 DELETE FROM cron.job_run_details WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='eden-recovery-ticket-purge' AND username=current_user) AND end_time<now()-interval '1 day';
$job$);
