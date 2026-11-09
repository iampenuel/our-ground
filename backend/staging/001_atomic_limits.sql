-- Staging-only overlay; NEVER include in the ordinary migration chain or app startup.
-- Run only through scripts/install-staging-limiter.mjs (one identity-checked transaction).
CREATE ROLE eden_staging_limiter_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT eden_staging_limiter_owner TO postgres;
CREATE SCHEMA eden_staging_limits AUTHORIZATION eden_staging_limiter_owner;
SET LOCAL ROLE eden_staging_limiter_owner;
REVOKE ALL ON SCHEMA eden_staging_limits FROM PUBLIC, anon, authenticated, service_role, our_ground_api;
CREATE TABLE eden_staging_limits.bucket (
  action text NOT NULL CHECK (action IN ('report','resolve','read','auth','logout','location','location_reference','location_submit','geo_search','geo_provider')),
  slot smallint NOT NULL CHECK (slot BETWEEN -2 AND 255),
  until_s bigint NOT NULL, used smallint NOT NULL CHECK (used BETWEEN 1 AND 200),
  PRIMARY KEY(action, slot)
) WITH (fillfactor=75, autovacuum_vacuum_scale_factor=0.05);
ALTER TABLE eden_staging_limits.bucket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE eden_staging_limits.bucket FROM PUBLIC, anon, authenticated, service_role, our_ground_api;

-- The runtime supplies only an allowlisted action, keyed slot, and configurations that
-- can lower a budget. It cannot supply a clock, limit, increment, namespace or window.
CREATE FUNCTION eden_staging_limits.admit(a text, s integer, budget integer, warn_pct integer)
RETURNS TABLE(allowed boolean, retry_s integer, warn boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE
  period integer; ceiling integer; day_cap integer:=0; burst boolean:=false;
  t bigint; slots integer[]; caps integer[]; periods integer[]; ends bigint[]:='{}';
  i integer; prev integer; n integer; day_used integer:=0; lock_id integer;
BEGIN
  lock_id:=array_position(ARRAY['report','resolve','read','auth','logout','location','location_reference','location_submit','geo_search','geo_provider'],a);
  IF lock_id IS NULL OR s IS NULL OR s NOT BETWEEN 0 AND 255 OR budget IS NULL OR budget NOT BETWEEN 1 AND 200 OR warn_pct IS NULL OR warn_pct NOT BETWEEN 50 AND 95 THEN
    RAISE EXCEPTION 'Invalid admission policy' USING ERRCODE='22023';
  END IF;
  period:=CASE WHEN a='report' THEN 3600 ELSE 60 END;
  ceiling:=CASE a WHEN 'report' THEN 3 WHEN 'resolve' THEN 6 WHEN 'read' THEN 120 WHEN 'auth' THEN 30 WHEN 'logout' THEN 60 WHEN 'location' THEN 30 WHEN 'location_reference' THEN 30 WHEN 'location_submit' THEN 6 WHEN 'geo_search' THEN 6 WHEN 'geo_provider' THEN 12 END;
  day_cap:=CASE WHEN a IN ('report','resolve') THEN 100 WHEN a='location' THEN least(100,budget) WHEN a='geo_provider' THEN budget ELSE 0 END;
  burst:=a='geo_provider';
  -- One short transaction lock per action, across all function instances. READ COMMITTED
  -- observes the previous holder's commit before any check. No take/refund sequence.
  PERFORM pg_advisory_xact_lock(1480730957,lock_id);
  t:=floor(extract(epoch FROM clock_timestamp()));
  slots:=ARRAY[s]; caps:=ARRAY[ceiling]; periods:=ARRAY[period];
  IF day_cap>0 THEN slots:=array_append(slots,-1); caps:=array_append(caps,day_cap); periods:=array_append(periods,86400); END IF;
  IF burst THEN slots:=array_append(slots,-2); caps:=array_append(caps,2); periods:=array_append(periods,1); END IF;
  FOR i IN 1..cardinality(slots) LOOP
    ends:=array_append(ends,(t/periods[i]+1)*periods[i]);
    SELECT b.used INTO prev FROM eden_staging_limits.bucket b WHERE b.action=a AND b.slot=slots[i] AND b.until_s=ends[i];
    IF coalesce(prev,0)>=caps[i] THEN RETURN QUERY SELECT false,(ends[i]-t)::integer,false; RETURN; END IF;
  END LOOP;
  FOR i IN 1..cardinality(slots) LOOP
    INSERT INTO eden_staging_limits.bucket AS b(action,slot,until_s,used) VALUES(a,slots[i],ends[i],1)
    ON CONFLICT(action,slot) DO UPDATE SET used=CASE WHEN b.until_s=excluded.until_s THEN b.used+1 ELSE 1 END, until_s=excluded.until_s RETURNING used INTO n;
    IF slots[i]=-1 THEN day_used:=n; END IF;
  END LOOP;
  RETURN QUERY SELECT true,0,burst AND day_used=greatest(1,day_cap*warn_pct/100);
END;
$body$;
REVOKE ALL ON FUNCTION eden_staging_limits.admit(text,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA eden_staging_limits TO our_ground_api;
GRANT EXECUTE ON FUNCTION eden_staging_limits.admit(text,integer,integer,integer) TO our_ground_api;

CREATE FUNCTION eden_staging_limits.purge() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE deleted integer;
BEGIN
  DELETE FROM eden_staging_limits.bucket WHERE until_s<=floor(extract(epoch FROM clock_timestamp()));
  GET DIAGNOSTICS deleted=ROW_COUNT; RETURN deleted;
END;
$body$;
REVOKE ALL ON FUNCTION eden_staging_limits.purge() FROM PUBLIC,anon,authenticated,service_role,our_ground_api;
RESET ROLE;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
-- Keep only one day of this job's own run history; never touch another job.
SELECT cron.schedule('eden10-staging-limiter-purge','*/5 * * * *',$job$
 SELECT eden_staging_limits.purge();
 DELETE FROM cron.job_run_details WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='eden10-staging-limiter-purge' AND username=current_user) AND end_time < now()-interval '1 day';
$job$);
