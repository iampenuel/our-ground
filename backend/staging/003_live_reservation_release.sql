-- A staging app may release its own opaque reservation, never read the table.
SET LOCAL ROLE eden_staging_limiter_owner;
CREATE FUNCTION eden_staging_limits.live_release(digest text, expected text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE affected integer;
BEGIN
  IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR expected IS NULL OR expected !~ '^[A-Za-z0-9_-]{43}(:[0-9]{13})?$' THEN
    RAISE EXCEPTION 'Invalid Live reservation' USING ERRCODE='22023';
  END IF;
  DELETE FROM eden_staging_limits.eden_ticket WHERE k=digest AND v=expected;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$body$;
REVOKE ALL ON FUNCTION eden_staging_limits.live_release(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION eden_staging_limits.live_release(text,text) TO our_ground_api;
RESET ROLE;
