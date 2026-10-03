-- Local development only. Runs once via docker-entrypoint-initdb.d when the
-- postgres container's data volume is first created. It creates the
-- least-privileged application role that the API connects as (DATABASE_URL
-- in .env.example); migrations run as the `postgres` superuser
-- (DATABASE_MIGRATOR_URL), which is required both to run DDL and because
-- Postgres superusers bypass row-level security entirely — RLS enforcement
-- (Section 5.1c) only takes effect for a non-superuser connection.
--
-- In staging/production this role and its password are provisioned by
-- Terraform (infra/terraform) from the managed secret store, never from a
-- checked-in script (Section 13.3).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'voice_app') THEN
    CREATE ROLE voice_app LOGIN PASSWORD 'local-dev-only';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE voice_receptionist TO voice_app;
