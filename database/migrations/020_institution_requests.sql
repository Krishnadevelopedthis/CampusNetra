-- ============================================================
-- Campus Netra — Migration 020: institution registration needs approval
--
-- "Register an institution" used to create the organization and its first
-- admin on the spot, so anyone on the internet could mint a tenant. It now
-- files a request here instead; the organization and the admin account are
-- created only when a platform administrator approves it.
--
-- The applicant's password is stored hashed (never plain) so they can sign in
-- with it once approved. Idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS institution_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_name TEXT        NOT NULL,
    full_name        TEXT        NOT NULL,
    email            TEXT        NOT NULL,
    phone            TEXT,
    designation      TEXT,
    password_hash    TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
    decided_at       TIMESTAMPTZ,
    decision_note    TEXT,
    organization_id  UUID        REFERENCES organizations(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open request per email address.
CREATE UNIQUE INDEX IF NOT EXISTS uq_institution_requests_pending_email
    ON institution_requests (lower(email)) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_institution_requests_status
    ON institution_requests (status, created_at DESC);

COMMIT;
