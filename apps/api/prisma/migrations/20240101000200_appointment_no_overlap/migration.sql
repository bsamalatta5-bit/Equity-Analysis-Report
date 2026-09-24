-- Section 5.1(a): a staff member cannot hold two non-cancelled appointments
-- with overlapping time ranges. Enforced in the database, not application
-- code, so it holds even under concurrent writes (A4.3).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (
    "staffMemberId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE (status <> 'cancelled');
