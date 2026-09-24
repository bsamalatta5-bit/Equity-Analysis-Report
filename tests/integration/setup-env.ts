// Fills in local-dev defaults for any variable the runner didn't already
// set (CI sets these explicitly; a local `pnpm test:integration` run
// relies on `docker compose up -d postgres redis` per Section 8's setup
// order and these matching docker-compose.yml / .env.example defaults).
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://voice_app:local-dev-only@localhost:5432/voice_receptionist",
  DATABASE_MIGRATOR_URL: "postgresql://postgres:local-dev-only@localhost:5432/voice_receptionist",
  REDIS_URL: "redis://localhost:6379",
  ACCESS_TOKEN_TTL_SECONDS: "900",
  REFRESH_TOKEN_TTL_SECONDS: "604800",
  DASHBOARD_ORIGIN: "http://localhost:3000",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
