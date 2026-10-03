# Runbook: canary deployment (A13.4)

Goal: prove a new version is healthy against a small slice of real
traffic before it receives all of it, so a bad deploy affects the
smallest possible number of real calls/requests before anyone
intervenes. This complements, not replaces, `docs/runbooks/
migration-ordering.md` (which governs when it's even safe to start a
deploy) and `docs/runbooks/rollback.md` (what to do if the canary step
below fails).

## Why this matters more here than in a typical web app

`apps/voice-gateway` holds live telephony sessions in Redis for the
duration of a call (Module 5). A bad deploy that gets 100% of traffic
immediately doesn't just serve some broken HTTP responses — it can drop
active calls with real callers on the line. A canary step that catches a
regression while it's only getting a few percent of new calls is the
difference between a handful of bad calls and every call on the
platform.

## Mechanism

`infra/terraform/compute.tf`'s `aws_ecs_service.api` doesn't yet define
a weighted canary split (its ALB listener forwards 100% of traffic to one
target group) — this is the one piece of A13.4 that's a real gap, not
just unapplied-but-complete like the rest of `infra/terraform/`: a true
weighted canary needs either a second ALB listener rule with a weighted
target-group forward, AWS CodeDeploy's blue/green ECS deployment type, or
a service mesh (App Mesh/Istio) doing traffic splitting. None of those is
provisioned. Until one is, "canary" here means a **time-boxed health
gate on the ECS rolling deployment itself**, using the
`minimumHealthyPercent`/`maximumPercent` deployment configuration ECS
already supports plus the ALB health check `aws_lb_target_group.api`
already defines (`/health/ready`, 2 consecutive passes to go healthy, 3
consecutive failures to go unhealthy) — real protection, just coarser
than a weighted split: a new task has to pass health checks before it
receives _any_ traffic, and old tasks aren't torn down until enough new
ones are confirmed healthy.

## Procedure

1. Before deploying, confirm the alarms in `infra/terraform/alerting.tf`
   are currently `OK` (`aws cloudwatch describe-alarms --alarm-names
voice-receptionist-production-api-5xx-rate
voice-receptionist-production-api-unhealthy-targets`) — deploying on
   top of an already-alarming baseline makes the next step meaningless.
2. Deploy the new task definition revision with a deliberately
   conservative rollout so only a minority of capacity is on the new
   version at any one point:
   ```
   aws ecs update-service \
     --cluster voice-receptionist-production \
     --service voice-receptionist-production-api \
     --task-definition voice-receptionist-production-api:<new-revision> \
     --deployment-configuration "minimumHealthyPercent=100,maximumPercent=125"
   ```
   With `desiredCount=2` (the Terraform default for production), this
   adds at most one new-version task before any old-version task is
   removed — one new task serving roughly a third of API traffic is this
   deployment's canary window.
3. **Hold** at that state for a fixed window (10 minutes is a reasonable
   default for this traffic pattern — long enough to see a real-call's
   full lifecycle, short enough not to stall routine deploys) and watch:
   - `aws_cloudwatch_metric_alarm.api_5xx` / `api_unhealthy_hosts` — any
     alarm transition to `ALARM` during the hold window fails the canary.
   - Application logs for the new task specifically (`aws logs tail
/ecs/voice-receptionist-production/api --since 10m --filter-pattern
'{ $.level >= 50 }'`, matching this codebase's pino log levels) —
     a spike in error-level logs scoped to the new task's container id
     fails the canary even if it hasn't yet tripped an aggregate alarm.
4. **Canary passed** → let the rolling deployment continue to
   completion (`aws ecs update-service ... --deployment-configuration
"minimumHealthyPercent=100,maximumPercent=200"` restores the normal
   configuration, or simply let ECS finish the deployment already in
   progress).
5. **Canary failed** → follow `docs/runbooks/rollback.md` immediately.
   Do not extend the hold window hoping it recovers on its own.

## Known gap

A true weighted-traffic canary (an exact, controllable percentage of
_real user_ requests, independent of how many tasks are running) is not
provisioned. If this matters enough to build before the coarser
health-gate approach above is acceptable, the concrete next step is
adding a second `aws_lb_listener_rule` with a `forward` action's
`target_group` weights split across two target groups (one per task
definition revision) in `infra/terraform/compute.tf` — tracked here
rather than silently assumed to already exist.
