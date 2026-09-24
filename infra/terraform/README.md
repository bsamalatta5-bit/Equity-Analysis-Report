# infra/terraform

Module 13 (Delivery Infrastructure): network, database, cache, storage,
compute, secrets, and alerting resources. Not built in this session — see
`docs/adr/version-substitutions.md` for what was and wasn't in scope.
This session's local/CI setup instead runs against a docker-compose
Postgres+Redis (`docker-compose.yml`) or, in CI, GitHub Actions service
containers (`.github/workflows/ci.yml`).
