# Runbook: rollback (A13.5)

Who can execute this: anyone with ECS deploy access for the affected
service. Read `docs/runbooks/migration-ordering.md` first if the deploy
being rolled back included a Prisma migration — whether a schema rollback
is needed (usually not) depends entirely on whether that migration was
additive.

## When to roll back

Any of:

- `aws_cloudwatch_metric_alarm.api_5xx` or `api_unhealthy_hosts`
  (`infra/terraform/alerting.tf`) fired within minutes of a deploy
  completing.
- The canary step in `docs/runbooks/canary-deployment.md` failed its own
  gate.
- A human on-call judges the new version broken by means the alarms
  above don't cover (a correctness bug, not an availability one).

Do not wait for a second opinion before rolling back a production
incident — a rollback is reversible (you can always roll forward again
once the real fix is ready); staying on a broken version while the
incident continues is not.

## Application rollback (the common case — no migration involved, or the migration was additive)

1. Identify the last known-good task definition revision:
   ```
   aws ecs list-task-definitions --family-prefix voice-receptionist-production-api --sort DESC
   ```
2. Point the service back at it:
   ```
   aws ecs update-service \
     --cluster voice-receptionist-production \
     --service voice-receptionist-production-api \
     --task-definition voice-receptionist-production-api:<previous-revision> \
     --force-new-deployment
   ```
3. Watch the rollout: `aws ecs describe-services --cluster ... --services
...` until `runningCount` equals `desiredCount` on the restored
   revision and the ALB target group (`aws_lb_target_group.api`) reports
   every target healthy.
4. Confirm the alarm(s) that triggered the rollback return to `OK`
   (`aws cloudwatch describe-alarms --alarm-names ...`).
5. Repeat for `apps/voice-gateway` and `apps/dashboard` if the same
   deploy touched them and they show the same symptoms — each is an
   independent ECS service with its own task definition history; rolling
   back `api` does not roll back the other two.

## If the deploy included a destructive migration (the rare, dangerous case)

This should not happen if `docs/runbooks/migration-ordering.md` was
followed — a destructive migration only ships in deploy 2 of a two-deploy
sequence, once deploy 1's code change is already fully running. If it
happened anyway (the sequencing was wrong, or deploy 1 didn't actually
finish draining before deploy 2 shipped):

1. **Do not run the application rollback above first.** The _old_ task
   definition's code expects the column/table the migration just
   removed; rolling back to it against the now-migrated schema trades
   one outage for a worse one (every query touching the missing
   column/table errors, instead of whatever the forward bug was).
2. Assess which is actually faster and safer to restore full function:
   writing and reviewing a reverse migration that restores the removed
   shape, or fixing forward (patching the new code's actual bug and
   deploying that instead of rolling back at all). There is no default
   answer — this is a judgment call specific to the incident, made by
   whoever is on call, not a step to follow mechanically.
3. Whichever path is chosen, treat the resulting SQL with the same review
   rigor as any other migration in this codebase (hand-authored, reviewed
   against the real schema in `apps/api/prisma/schema.prisma`) — an
   incident is not a reason to skip that, since a wrong reverse migration
   is a second, self-inflicted incident on top of the first.
4. File a follow-up to fix whatever let a destructive migration ship
   ahead of its paired code change — this runbook's existence is the
   control that's supposed to prevent it, so this is also a signal that
   process broke down somewhere.

## Database connection exhaustion during rollback

Rolling an ECS service `--force-new-deployment` briefly runs both the
previous and the (broken) current revision's tasks side by side during
the swap — the same rolling-update behavior
`docs/runbooks/migration-ordering.md` warns about, just now in reverse.
This is expected and self-resolving within the deployment's drain
timeout; it is not itself a reason to intervene further.
