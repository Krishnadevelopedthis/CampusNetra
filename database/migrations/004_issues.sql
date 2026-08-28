-- ============================================================
-- Campus Netra — 004: Issue / Complaint Management
-- ============================================================

CREATE TABLE issue_categories (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,          -- Electrical, Plumbing, Network…
    code             TEXT    NOT NULL,
    icon             TEXT,
    department_id    UUID    REFERENCES departments(id) ON DELETE SET NULL,
    default_priority priority_level NOT NULL DEFAULT 'medium',
    -- keywords the heuristic classifier matches against when the LLM is unavailable
    keywords         TEXT[]  NOT NULL DEFAULT '{}',
    sla_response_mins INT    NOT NULL DEFAULT 240,
    sla_resolve_mins  INT    NOT NULL DEFAULT 1440,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (organization_id, code)
);

CREATE TABLE issues (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- human reference shown everywhere in the UI: CMP-1042
    reference         TEXT        NOT NULL UNIQUE,
    organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campus_id         UUID        NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,

    title             TEXT        NOT NULL,
    description       TEXT        NOT NULL,

    -- spatial anchor: this is what pins the complaint onto the digital twin
    building_id       UUID        REFERENCES buildings(id) ON DELETE SET NULL,
    floor_id          UUID        REFERENCES floors(id)    ON DELETE SET NULL,
    room_id           UUID        REFERENCES rooms(id)     ON DELETE SET NULL,
    asset_id          UUID        REFERENCES assets(id)    ON DELETE SET NULL,
    location_note     TEXT,
    latitude          NUMERIC(10,7),
    longitude         NUMERIC(10,7),

    category_id       UUID        REFERENCES issue_categories(id) ON DELETE SET NULL,
    department_id     UUID        REFERENCES departments(id)      ON DELETE SET NULL,
    priority          priority_level NOT NULL DEFAULT 'medium',
    status            issue_status   NOT NULL DEFAULT 'reported',

    reported_by       UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_anonymous      BOOLEAN     NOT NULL DEFAULT FALSE,

    -- AI classification output, kept for the "AI Classification Performance" screen
    ai_category_id    UUID        REFERENCES issue_categories(id) ON DELETE SET NULL,
    ai_confidence     NUMERIC(4,3),
    ai_priority       priority_level,
    ai_reasoning      TEXT,
    ai_model          TEXT,
    ai_classified_at  TIMESTAMPTZ,
    -- set when a human overrode the AI; the delta is the training signal
    was_reclassified  BOOLEAN     NOT NULL DEFAULT FALSE,

    -- duplicate detection
    duplicate_of      UUID        REFERENCES issues(id) ON DELETE SET NULL,
    duplicate_score   NUMERIC(4,3),

    -- SLA tracking
    sla_due_at        TIMESTAMPTZ,
    responded_at      TIMESTAMPTZ,
    resolved_at       TIMESTAMPTZ,
    closed_at         TIMESTAMPTZ,
    sla_breached      BOOLEAN     NOT NULL DEFAULT FALSE,

    upvote_count      INT         NOT NULL DEFAULT 0,
    search_vector     tsvector,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_issues_status   ON issues (organization_id, status);
CREATE INDEX idx_issues_reporter ON issues (reported_by, created_at DESC);
CREATE INDEX idx_issues_room     ON issues (room_id) WHERE status NOT IN ('closed','rejected','duplicate');
CREATE INDEX idx_issues_asset    ON issues (asset_id);
CREATE INDEX idx_issues_dept     ON issues (department_id, status);
CREATE INDEX idx_issues_search   ON issues USING GIN (search_vector);
CREATE INDEX idx_issues_trgm     ON issues USING GIN (title gin_trgm_ops);

-- Keep the full-text column in sync automatically.
CREATE FUNCTION issues_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.location_note,'')), 'C');
    NEW.updated_at := now();
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issues_search
    BEFORE INSERT OR UPDATE OF title, description, location_note ON issues
    FOR EACH ROW EXECUTE FUNCTION issues_search_trigger();

CREATE TABLE issue_attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id    UUID        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    thumb_url   TEXT,
    filename    TEXT,
    mime_type   TEXT,
    size_bytes  BIGINT,
    -- 'report' = photo attached when raising, 'resolution' = proof of fix
    purpose     TEXT        NOT NULL DEFAULT 'report' CHECK (purpose IN ('report','resolution','before','after')),
    -- perceptual hash reused by duplicate detection & L&F image matching
    phash       TEXT,
    uploaded_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_issue_attach ON issue_attachments (issue_id);

-- Feeds the "Issue Timeline" screen.
CREATE TABLE issue_events (
    id          BIGSERIAL PRIMARY KEY,
    issue_id    UUID        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    from_status issue_status,
    to_status   issue_status,
    note        TEXT,
    actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_issue_events ON issue_events (issue_id, created_at);

-- Lets several people confirm the same problem instead of filing duplicates.
CREATE TABLE issue_upvotes (
    issue_id   UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (issue_id, user_id)
);

-- Candidate duplicates surfaced by AI, pending human confirmation.
CREATE TABLE issue_duplicate_candidates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id      UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    candidate_id  UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    score         NUMERIC(4,3) NOT NULL,
    signals       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {text:.9, spatial:1, temporal:.8}
    resolution    TEXT CHECK (resolution IN ('pending','confirmed','dismissed')) DEFAULT 'pending',
    reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (issue_id, candidate_id)
);

-- Deferred FK from 003 now that issues exists.
ALTER TABLE asset_state_history
    ADD CONSTRAINT fk_ash_issue FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE SET NULL;
