# infra/terraform

Module 13 (Delivery Infrastructure), A13.1: real Terraform for every
resource Section 13 names — network, database, cache, storage, compute,
secrets, and alerting — written as genuine, runnable configuration, not
a sketch. **Never applied.** No cloud account exists for this session to
provision against, and `terraform apply` is not something an autonomous
build session should run unattended against real infrastructure in any
case. This directory is what a human operator runs once they have an AWS
account and have reviewed the plan.

## Why AWS

Section 3 pins no cloud vendor (the same stance `docs/adr/
version-substitutions.md` documents for object storage and payment
processing), so this is one concrete, illustrative choice rather than a
vendor commitment — swapping to GCP/Azure means rewriting these files
against `google_*`/`azurerm_*` resources, not changing application code,
since every secret still arrives the same way (`docs/secrets.md`) and
every application-level interface (object storage, encryption, signed
URLs) is already vendor-neutral.

## Files

| File                                        | Section 13 resource category | What's in it                                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `network.tf`                                | Network                      | VPC, public/private subnets across 2 AZs, per-AZ NAT gateways, security groups (ALB/compute/db/cache).                                                                                                                   |
| `database.tf`                               | Database                     | RDS for PostgreSQL 16 (pgvector-capable), multi-AZ in production, the migrator + application connection-string secrets.                                                                                                  |
| `cache.tf`                                  | Cache                        | ElastiCache Redis replication group, encrypted at rest and in transit.                                                                                                                                                   |
| `storage.tf`                                | Storage                      | The S3 bucket `apps/api/src/calls/recording-storage.ts`'s local-disk stand-in would write to instead — versioned, KMS-encrypted, no public access, a 120-day lifecycle backstop behind A10.3's own 90-day retention job. |
| `compute.tf`                                | Compute                      | ECS Fargate cluster, one fully worked task definition + service (`apps/api`) showing the secrets-injection pattern, an ALB.                                                                                              |
| `secrets.tf`                                | Secrets                      | The remaining generated secrets from `docs/secrets.md`'s inventory (recording encryption key, recording signing secret, voice-gateway service token).                                                                    |
| `alerting.tf`                               | Alerting                     | An SNS topic plus CloudWatch alarms for database/cache/API health.                                                                                                                                                       |
| `variables.tf`, `versions.tf`, `outputs.tf` | —                            | Inputs, provider/version pins, and what a deploy pipeline needs back out.                                                                                                                                                |

`compute.tf` writes out `apps/api`'s ECS task definition and service in
full as one worked example rather than three near-identical copies for
`apps/voice-gateway` and `apps/dashboard` — same execution role, same
secrets-injection pattern, different image/port and (per `docs/secrets.md`)
a different subset of secrets each one actually needs.

## What was and wasn't verified in this sandbox

`terraform fmt -check` passes on every file (exit 0) — `fmt` has to fully
parse each file's HCL into its syntax tree to reformat it, so this is a
real proof the syntax is correct, not a claim taken on faith. `terraform
validate`, which additionally checks every resource's arguments against
the AWS/random provider's real schema, could not run:
`registry.terraform.io` is not on this sandbox's network allowlist (the
same category of restriction documented elsewhere in this build for
Semgrep's rule registry, Trivy's vulnerability database, and
`cdn.playwright.dev`), so `terraform init` fails before `validate` ever
runs. A real operator's first step — `terraform init && terraform
validate && terraform plan` — has normal internet access and would run
this the rest of the way; a plan and a careful read of it should still
precede any `apply`.

## Secrets this configuration creates

Every secret in `docs/secrets.md`'s inventory that this application
originates itself (as opposed to a third-party provider credential) is
generated by `random_password`/`random_id` and stored directly in AWS
Secrets Manager — never written to a `.tfvars` file, never logged, never
passed as a plain Terraform variable. `outputs.tf`'s `secrets_manager_arns`
is what a deploy pipeline reads to wire each ECS task definition's
`secrets` block, the mechanism `compute.tf`'s `aws_ecs_task_definition.api`
already demonstrates.
