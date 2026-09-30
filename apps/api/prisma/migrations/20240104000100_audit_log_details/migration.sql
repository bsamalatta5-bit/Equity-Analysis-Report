-- Module 10 (A10.3): "writing an audit entry per deletion batch." AuditLog
-- had no column to record how many rows a batch affected — this adds one,
-- nullable so every existing AuditService.record() call site (which never
-- passes it) is unaffected.
ALTER TABLE "AuditLog" ADD COLUMN "details" JSONB;
