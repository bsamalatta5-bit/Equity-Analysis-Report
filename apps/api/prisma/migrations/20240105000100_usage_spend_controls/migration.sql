-- Module 11 (A11.2/A11.3): Subscription needs per-tenant configuration
-- beyond Section 5's literal list (the same kind of addition as
-- AuditLog.details in 20240104000100 — see docs/adr/data-model.md's note
-- that fields added beyond Section 5's own list are deliberately excluded
-- from that doc, not from the schema).
ALTER TABLE "Subscription" ADD COLUMN "concurrentCallLimit" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Subscription" ADD COLUMN "costPerBillableMinuteCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "monthlySpendCapCents" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "spendCapBreachedAt" TIMESTAMPTZ;

-- A11.3: a call routed straight to transfer/message-capture because the
-- tenant's monthly spend cap was already breached gets its own
-- disposition, distinct from "provider_failure" (an actual vendor
-- failure) even though the caller-facing degradation is the same shape.
ALTER TYPE "CallDisposition" ADD VALUE 'spend_limit_suspended';
