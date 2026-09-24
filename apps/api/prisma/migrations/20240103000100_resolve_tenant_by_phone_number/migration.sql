-- A3.8: the voice gateway resolves the tenant for an inbound call "from
-- the provisioned number record only" — the called (toE164) number. It
-- carries no tenant context before that lookup, so this needs the same
-- SECURITY DEFINER escape hatch as resolve_tenant_id_for_email
-- (20240102000100_row_level_security) for exactly the same reason: every
-- direct "PhoneNumber" query is rejected by its own RLS policy until
-- app.current_tenant_id is known, and this is how it becomes known.
--
-- Exposes only the tenantId (and locationId, needed to create the Call
-- row) for an active phone number — never any other column.

CREATE OR REPLACE FUNCTION resolve_tenant_for_phone_number(number_e164 text)
RETURNS TABLE(tenant_id uuid, location_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId", "locationId"
  FROM "PhoneNumber"
  WHERE "e164Number" = number_e164
    AND status = 'active';
$$;

REVOKE ALL ON FUNCTION resolve_tenant_for_phone_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_for_phone_number(text) TO voice_app;
