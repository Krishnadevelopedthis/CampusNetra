-- ============================================================
-- Campus Netra — 007: Notifications, AI, Simulation, Audit
-- ============================================================

CREATE TABLE notification_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,          -- 'issue.assigned', 'lf.match_found'
    channel         notification_channel NOT NULL,
    subject         TEXT,
    body            TEXT NOT NULL,          -- supports {{placeholders}}
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (organization_id, code, channel)
);

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    body        TEXT,
    -- deep link the frontend routes to on click
    link        TEXT,
    kind        TEXT        NOT NULL DEFAULT 'info',
    entity_type TEXT,
    entity_id   UUID,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- ---------- AI observability ----------
-- Every model call is logged so the AI Management screens have real numbers.
CREATE TABLE ai_invocations (
    id            BIGSERIAL PRIMARY KEY,
    organization_id UUID      REFERENCES organizations(id) ON DELETE CASCADE,
    task          TEXT        NOT NULL,     -- classify_issue | detect_duplicate | match_lf | assistant
    model         TEXT        NOT NULL,
    entity_type   TEXT,
    entity_id     UUID,
    input_tokens  INT,
    output_tokens INT,
    latency_ms    INT,
    confidence    NUMERIC(4,3),
    succeeded     BOOLEAN     NOT NULL DEFAULT TRUE,
    -- set to TRUE when the heuristic fallback ran because the LLM was unavailable
    used_fallback BOOLEAN     NOT NULL DEFAULT FALSE,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_task ON ai_invocations (task, created_at DESC);

-- Human verdict on an AI output — the ground truth for the accuracy dashboards.
CREATE TABLE ai_feedback (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task         TEXT NOT NULL,
    entity_type  TEXT NOT NULL,
    entity_id    UUID NOT NULL,
    was_correct  BOOLEAN NOT NULL,
    corrected_to JSONB,
    actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id UUID    NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role            TEXT    NOT NULL CHECK (role IN ('user','assistant','system')),
    content         TEXT    NOT NULL,
    -- records which DB lookups the assistant performed to answer
    tool_calls      JSONB,
    confidence      NUMERIC(4,3),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_msgs ON ai_messages (conversation_id, created_at);

-- Curated facts the assistant can cite (Admin > AI Knowledge Base).
CREATE TABLE ai_knowledge (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    tags       TEXT[] NOT NULL DEFAULT '{}',
    search_vector tsvector,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kb_search ON ai_knowledge USING GIN (search_vector);

-- ---------- Predictive maintenance ----------
CREATE TABLE maintenance_predictions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id      UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    predicted_for DATE        NOT NULL,
    risk_score    NUMERIC(4,3) NOT NULL,      -- 0..1 probability of failure
    reasoning     TEXT,
    signals       JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- {age, fault_count, mtbf_days}
    -- the preventive WO generated from this prediction, if accepted
    work_order_id UUID        REFERENCES work_orders(id) ON DELETE SET NULL,
    dismissed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_predictions_risk ON maintenance_predictions (risk_score DESC) WHERE dismissed_at IS NULL;

-- ---------- Scenario simulation ----------
CREATE TABLE simulations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campus_id     UUID        REFERENCES campuses(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,       -- "30 simultaneous complaints"
    scenario_type TEXT        NOT NULL DEFAULT 'complaint_surge'
                   CHECK (scenario_type IN ('complaint_surge','staff_shortage','asset_failure','what_if')),
    -- knobs from the Simulation Configuration screen
    config        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status        TEXT        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','running','completed','failed')),
    -- department fan-out, technician load, SLA projection
    results       JSONB,
    created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Audit & security ----------
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    organization_id UUID     REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT         NOT NULL,       -- 'user.deactivate', 'issue.reassign'
    entity_type TEXT,
    entity_id   UUID,
    before      JSONB,
    after       JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor  ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);

CREATE TABLE login_activity (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT,
    succeeded   BOOLEAN     NOT NULL,
    failure_reason TEXT,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_user ON login_activity (user_id, created_at DESC);

-- ---------- Counters for human-readable references ----------
-- A dedicated table avoids sequence gaps looking odd in CMP-#### references.
CREATE TABLE reference_counters (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    prefix          TEXT NOT NULL,      -- CMP | WO | LF | LR | CLM | INS
    current_value   BIGINT NOT NULL DEFAULT 1000,
    PRIMARY KEY (organization_id, prefix)
);

CREATE FUNCTION next_reference(p_org UUID, p_prefix TEXT) RETURNS TEXT AS $$
DECLARE
    v_next BIGINT;
BEGIN
    INSERT INTO reference_counters (organization_id, prefix, current_value)
    VALUES (p_org, p_prefix, 1001)
    ON CONFLICT (organization_id, prefix)
    DO UPDATE SET current_value = reference_counters.current_value + 1
    RETURNING current_value INTO v_next;

    RETURN p_prefix || '-' || v_next::TEXT;
END
$$ LANGUAGE plpgsql;
