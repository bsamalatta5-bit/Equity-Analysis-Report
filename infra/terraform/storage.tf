# Storage: the real object store apps/api/src/calls/recording-storage.ts's
# local-disk stand-in would write to instead (documented in
# docs/adr/version-substitutions.md — the app's own encryption/signed-URL
# logic is real and unaffected by this; only the byte storage backend
# changes). Versioned and encrypted; no public access under any
# circumstance — every recording is reachable only through the
# application's own HMAC-signed, time-limited URLs (A10.2), never a direct
# S3 URL.

resource "aws_s3_bucket" "recordings" {
  bucket = "${local.name_prefix}-recordings"
  tags   = { Name = "${local.name_prefix}-recordings" }
}

resource "aws_s3_bucket_versioning" "recordings" {
  bucket = aws_s3_bucket.recordings.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "recordings" {
  bucket = aws_s3_bucket.recordings.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# A10.3's retention job deletes expired objects itself (90-day recordings,
# 24-month transcripts — the transcript side lives in Postgres, not here).
# A bucket lifecycle rule is kept deliberately short, as a defense-in-depth
# backstop for a retention-job bug, not the primary enforcement mechanism —
# the authoritative 90-day deadline is `run-retention.ts`'s own logic
# against `Call.recordingExpiresAt`.
resource "aws_s3_bucket_lifecycle_configuration" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  rule {
    id     = "backstop-expiry"
    status = "Enabled"
    filter {}

    expiration {
      days = 120 # 30-day margin past A10.3's 90-day deadline.
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_secretsmanager_secret" "recording_bucket" {
  name                    = "${local.name_prefix}/recording-bucket"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "recording_bucket" {
  secret_id     = aws_secretsmanager_secret.recording_bucket.id
  secret_string = aws_s3_bucket.recordings.id
}
