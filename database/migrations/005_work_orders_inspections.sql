-- ============================================================
-- Campus Netra — 005: Work Orders, SLA & Inspections
-- ============================================================

CREATE TABLE sla_policies (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT           NOT NULL,
    priority         priority_level NOT NULL,
    department_id    UUID           REFERENCES departments(id) ON DELETE CASCADE,
    response_mins    INT            NOT NULL,
    resolve_mins     INT            NOT NULL,
    -- escalate to these users when the clock runs out
    escalate_after_mins INT,
    escalate_to_role user_role,
    business_hours_only BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sla_unique ON sla_policies (organization_id, priority, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_active;

CREATE TABLE work_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       TEXT        NOT NULL UNIQUE,      -- WO-1024
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    issue_id        UUID        REFERENCES issues(id) ON DELETE SET NULL,

    title           TEXT        NOT NULL,
    description     TEXT,
    room_id         UUID        REFERENCES rooms(id)  ON DELETE SET NULL,
    asset_id        UUID        REFERENCES assets(id) ON DELETE SET NULL,

    department_id   UUID        REFERENCES departments(id) ON DELETE SET NULL,
    assigned_to     UUID        REFERENCES users(id)       ON DELETE SET NULL,
    assigned_by     UUID        REFERENCES users(id)       ON DELETE SET NULL,
    assigned_at     TIMESTAMPTZ,

    priority        priority_level    NOT NULL DEFAULT 'medium',
    status          work_order_status NOT NULL DEFAULT 'open',

    scheduled_for   TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    verified_at     TIMESTAMPTZ,
    verified_by     UUID        REFERENCES users(id) ON DELETE SET NULL,

    sla_policy_id   UUID        REFERENCES sla_policies(id) ON DELETE SET NULL,
    sla_due_at      TIMESTAMPTZ,
    sla_breached    BOOLEAN     NOT NULL DEFAULT FALSE,

    estimated_mins  INT,
    actual_mins     INT,
    labour_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
    parts_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,

    resolution_note TEXT,
    -- set when the technician reports they cannot fix it
    blocked_reason  TEXT,
    -- work orders raised by the predictive-maintenance engine rather than a human
    is_predictive   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wo_assignee ON work_orders (assigned_to, status);
CREATE INDEX idx_wo_status   ON work_orders (organization_id, status);
CREATE INDEX idx_wo_issue    ON work_orders (issue_id);
CREATE INDEX idx_wo_sla      ON work_orders (sla_due_at) WHERE status NOT IN ('closed','cancelled','verified');

CREATE TABLE work_order_events (
    id            BIGSERIAL PRIMARY KEY,
    work_order_id UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    from_status   work_order_status,
    to_status     work_order_status,
    note          TEXT,
    actor_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
    meta          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wo_events ON work_order_events (work_order_id, created_at);

CREATE TABLE work_order_comments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    author_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body          TEXT        NOT NULL,
    is_internal   BOOLEAN     NOT NULL DEFAULT FALSE,   -- hidden from the reporter
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE work_order_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    url           TEXT        NOT NULL,
    thumb_url     TEXT,
    filename      TEXT,
    purpose       TEXT        NOT NULL CHECK (purpose IN ('before','after','part','document')),
    uploaded_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Technician "Request Parts / Resources" flow.
CREATE TABLE part_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    requested_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_name     TEXT        NOT NULL,
    quantity      INT         NOT NULL DEFAULT 1,
    justification TEXT,
    status        TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','fulfilled')),
    approved_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    unit_cost     NUMERIC(12,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Inspections ----------
CREATE TABLE inspection_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    description     TEXT,
    category_id     UUID    REFERENCES asset_categories(id) ON DELETE SET NULL,
    frequency_days  INT,                                   -- NULL = ad-hoc
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inspection_template_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID    NOT NULL REFERENCES inspection_templates(id) ON DELETE CASCADE,
    position    INT     NOT NULL,
    prompt      TEXT    NOT NULL,
    help_text   TEXT,
    requires_photo BOOLEAN NOT NULL DEFAULT FALSE,
    is_critical    BOOLEAN NOT NULL DEFAULT FALSE          -- a fail here auto-raises an issue
);

CREATE TABLE inspections (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference     TEXT        NOT NULL UNIQUE,             -- INS-0031
    template_id   UUID        REFERENCES inspection_templates(id) ON DELETE SET NULL,
    organization_id UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    room_id       UUID        REFERENCES rooms(id)  ON DELETE SET NULL,
    asset_id      UUID        REFERENCES assets(id) ON DELETE SET NULL,
    assigned_to   UUID        REFERENCES users(id)  ON DELETE SET NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status        inspection_status NOT NULL DEFAULT 'scheduled',
    submitted_at  TIMESTAMPTZ,
    submitted_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    score         NUMERIC(5,2),                            -- % of passed items
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspections_assignee ON inspections (assigned_to, status);
CREATE INDEX idx_inspections_due      ON inspections (scheduled_for) WHERE status IN ('scheduled','in_progress');

CREATE TABLE inspection_results (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID    NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    item_id       UUID    REFERENCES inspection_template_items(id) ON DELETE SET NULL,
    prompt        TEXT    NOT NULL,                        -- snapshot, template may change later
    result        checklist_result NOT NULL,
    note          TEXT,
    photo_url     TEXT,
    -- issue auto-created from a critical failure
    raised_issue_id UUID  REFERENCES issues(id) ON DELETE SET NULL
);

-- Deferred FK from 003.
ALTER TABLE asset_state_history
    ADD CONSTRAINT fk_ash_wo FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL;
