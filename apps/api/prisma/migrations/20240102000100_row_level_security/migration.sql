-- Section 5.1(c) / A2.3 / A2.4: tenant scoping is enforced at the data
-- layer, not just in application code. Every tenant-scoped table gets RLS
-- enabled and forced, with a policy comparing against the session-local
-- setting `app.current_tenant_id` (set per request by
-- apps/api/src/common/guards/tenant-scope.guard.ts via
-- `SET LOCAL app.current_tenant_id = ...` inside the request's transaction).
--
-- A connection that never sets this variable must see zero rows, not an
-- error, so every policy goes through app_current_tenant_id() below, which
-- returns NULL (never matches any row, including via NULL <> NULL) instead
-- of raising when the setting is absent.
--
-- FORCE ROW LEVEL SECURITY is applied even though voice_app does not own
-- these tables (ownership sits with the migrator role) — a non-owner,
-- non-superuser role is already subject to RLS unconditionally, but FORCE
-- is applied for defense in depth against a future ownership change.
-- Postgres superusers bypass RLS regardless of FORCE, which is why
-- DATABASE_MIGRATOR_URL must never be the connection the API itself uses.

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION app_current_tenant_id() TO voice_app;

-- A3.7: platform_operator is the one human role whose matrix cells are NOT
-- "(scoped)" for Tenant profile, Tenant users (identity only), Locations
-- (identity only), Phone numbers (status only), Call records (metadata),
-- Usage/billing, and Audit log — it reads across every tenant for those
-- eight tables specifically. `app.is_platform_operator` is set server-side
-- by tenant-scope.guard.ts only after the session's role is verified to be
-- platform_operator; it is never derived from client input. The narrower
-- "identity only" / "status only" / "metadata only" column restriction is
-- enforced by the service layer's response DTOs, not by RLS, which governs
-- row visibility, not column visibility.
CREATE OR REPLACE FUNCTION app_is_platform_operator() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.is_platform_operator', true), 'false') = 'true';
$$;

GRANT EXECUTE ON FUNCTION app_is_platform_operator() TO voice_app;

-- ---------------------------------------------------------------------------
-- Login bootstrap: a login attempt arrives with only an email, before
-- app.current_tenant_id can be known — every direct "User" query is
-- rejected by that table's own RLS policy until it is set. This
-- SECURITY DEFINER function runs as its owner (the migrator role, a
-- superuser locally, which bypasses RLS unconditionally) and exposes only
-- the matching tenantId, never password hashes or any other column. The
-- auth module calls it first, sets `app.current_tenant_id` from its
-- result, and only then runs the normal, RLS-scoped user lookup.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_tenant_id_for_email(user_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId" FROM "User" WHERE email = user_email;
$$;

REVOKE ALL ON FUNCTION resolve_tenant_id_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_id_for_email(text) TO voice_app;

-- ---------------------------------------------------------------------------
-- Tables carrying tenantId directly
-- ---------------------------------------------------------------------------

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING (id = app_current_tenant_id() OR app_is_platform_operator());

ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Location"
  USING ("tenantId" = app_current_tenant_id() OR app_is_platform_operator());

ALTER TABLE "PhoneNumber" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhoneNumber" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PhoneNumber"
  USING ("tenantId" = app_current_tenant_id() OR app_is_platform_operator());

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = app_current_tenant_id() OR app_is_platform_operator());

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Contact"
  USING ("tenantId" = app_current_tenant_id());

ALTER TABLE "Call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Call" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Call"
  USING ("tenantId" = app_current_tenant_id() OR app_is_platform_operator());

ALTER TABLE "KnowledgeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "KnowledgeItem"
  USING ("tenantId" = app_current_tenant_id());

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("tenantId" = app_current_tenant_id() OR app_is_platform_operator());

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Subscription"
  USING ("tenantId" = app_current_tenant_id() OR app_is_platform_operator());

ALTER TABLE "UsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UsageRecord"
  USING ("tenantId" = app_current_tenant_id() OR app_is_platform_operator());

-- ---------------------------------------------------------------------------
-- Tables scoped through a parent relationship (single hop to a tenantId
-- column, or to another table already scoped by this migration)
-- ---------------------------------------------------------------------------

ALTER TABLE "StaffMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StaffMember"
  USING (EXISTS (
    SELECT 1 FROM "Location" l
    WHERE l.id = "StaffMember"."locationId"
      AND l."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Service"
  USING (EXISTS (
    SELECT 1 FROM "Location" l
    WHERE l.id = "Service"."locationId"
      AND l."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Appointment"
  USING (EXISTS (
    SELECT 1 FROM "Location" l
    WHERE l.id = "Appointment"."locationId"
      AND l."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "EscalationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EscalationRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EscalationRule"
  USING (EXISTS (
    SELECT 1 FROM "Location" l
    WHERE l.id = "EscalationRule"."locationId"
      AND l."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "CallTurn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CallTurn" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CallTurn"
  USING (EXISTS (
    SELECT 1 FROM "Call" c
    WHERE c.id = "CallTurn"."callId"
      AND c."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsentRecord"
  USING (EXISTS (
    SELECT 1 FROM "Call" c
    WHERE c.id = "ConsentRecord"."callId"
      AND c."tenantId" = app_current_tenant_id()
  ));

-- ---------------------------------------------------------------------------
-- Tables scoped through two hops
-- ---------------------------------------------------------------------------

ALTER TABLE "AvailabilityRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AvailabilityRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AvailabilityRule"
  USING (EXISTS (
    SELECT 1 FROM "StaffMember" sm
    JOIN "Location" l ON l.id = sm."locationId"
    WHERE sm.id = "AvailabilityRule"."staffMemberId"
      AND l."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "BlockedPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockedPeriod" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BlockedPeriod"
  USING (EXISTS (
    SELECT 1 FROM "StaffMember" sm
    JOIN "Location" l ON l.id = sm."locationId"
    WHERE sm.id = "BlockedPeriod"."staffMemberId"
      AND l."tenantId" = app_current_tenant_id()
  ));

-- ---------------------------------------------------------------------------
-- Auth tables not enumerated in Section 5 but holding per-tenant user data
-- (defense in depth: same scoping principle applied consistently).
-- ---------------------------------------------------------------------------

ALTER TABLE "UserLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserLocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserLocation"
  USING (EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "UserLocation"."userId"
      AND u."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "RefreshTokenFamily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshTokenFamily" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RefreshTokenFamily"
  USING (EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = "RefreshTokenFamily"."userId"
      AND u."tenantId" = app_current_tenant_id()
  ));

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RefreshToken"
  USING (EXISTS (
    SELECT 1 FROM "RefreshTokenFamily" f
    JOIN "User" u ON u.id = f."userId"
    WHERE f.id = "RefreshToken"."familyId"
      AND u."tenantId" = app_current_tenant_id()
  ));
