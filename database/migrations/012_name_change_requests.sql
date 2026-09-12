-- ============================================================
-- Campus Netra — Migration 012: name change requests
--
-- A name has no OTP to send. Instead the person uploads an ID card, an OCR
-- pass checks whether the claimed name appears on it, and a confident match
-- auto-applies. Anything less is queued here for an administrator — the same
-- shape as account_deletion_requests, decided rather than deleted outright.
-- ============================================================

CREATE TABLE name_change_requests (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_name  TEXT        NOT NULL,
    requested_name TEXT        NOT NULL,
    id_document_url TEXT       NOT NULL,
    ocr_excerpt    TEXT,
    match_score    NUMERIC(3,2),
    status         TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','auto_approved','approved','rejected')),
    decided_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    decided_at     TIMESTAMPTZ,
    decision_note  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open request per person, same reasoning as the deletion-request table.
CREATE UNIQUE INDEX idx_name_change_one_open
    ON name_change_requests (user_id) WHERE status = 'pending';

CREATE INDEX idx_name_change_pending
    ON name_change_requests (created_at DESC) WHERE status = 'pending';
