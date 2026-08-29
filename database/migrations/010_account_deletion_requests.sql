-- ============================================================
-- Campus Netra — Migration 010: account deletion requests
--
-- Deleting an account cannot mean deleting the row. Issues, work orders and
-- lost-property reports all reference their author, and a campus's maintenance
-- history is not the requester's to erase — the fault someone reported still
-- happened and the technician who fixed it still needs the record.
--
-- So a request is raised, an administrator decides, and approval anonymises
-- the person rather than removing the row: the account stops working and stops
-- naming anybody, while the work it authored stays where it is.
-- ============================================================

CREATE TABLE account_deletion_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason        TEXT,
    status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected','withdrawn')),
    decided_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    decided_at    TIMESTAMPTZ,
    decision_note TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open request per person: asking twice is the same ask, and a queue with
-- duplicates in it is a queue an administrator stops trusting.
CREATE UNIQUE INDEX idx_deletion_one_open
    ON account_deletion_requests (user_id) WHERE status = 'pending';

CREATE INDEX idx_deletion_pending
    ON account_deletion_requests (created_at DESC) WHERE status = 'pending';
