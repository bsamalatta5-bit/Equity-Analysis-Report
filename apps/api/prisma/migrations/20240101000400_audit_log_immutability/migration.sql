-- Section 5.1(d): the AuditLog table is append-only. voice_app is the
-- least-privileged role the running API connects as (DATABASE_URL); it
-- must be able to read and insert audit entries but never alter or erase
-- them. Migrations themselves run as a separate, privileged role
-- (DATABASE_MIGRATOR_URL) and are unaffected by this revoke.
--
-- This migration also grants voice_app its baseline row privileges on
-- every application table, since a freshly created role has none by
-- default; the AuditLog restriction is layered on top of that baseline.

GRANT USAGE ON SCHEMA public TO voice_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO voice_app;

REVOKE UPDATE, DELETE ON "AuditLog" FROM voice_app;
