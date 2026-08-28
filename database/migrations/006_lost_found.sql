-- ============================================================
-- Campus Netra — 006: Lost & Found with AI Matching
-- ============================================================

CREATE TABLE lf_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,     -- Bags & Luggage, Electronics, ID Cards…
    code            TEXT    NOT NULL,
    icon            TEXT,
    -- how long an unclaimed report stays live before auto-archiving
    retention_days  INT     NOT NULL DEFAULT 90,
    UNIQUE (organization_id, code)
);

-- A single table holds both sides of the ledger; `kind` separates them.
-- Keeping them together makes the matching query a straight self-join.
CREATE TABLE lf_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       TEXT        NOT NULL UNIQUE,     -- LF-2026-0082 / LR-2026-1145
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campus_id       UUID        REFERENCES campuses(id) ON DELETE SET NULL,
    kind            lf_kind     NOT NULL,
    status          lf_status   NOT NULL DEFAULT 'open',

    title           TEXT        NOT NULL,            -- "Black Backpack"
    description     TEXT,
    category_id     UUID        REFERENCES lf_categories(id) ON DELETE SET NULL,
    colour          TEXT,
    brand           TEXT,
    distinguishing_marks TEXT,                       -- "blue braided cord keychain"

    -- where + when, the two strongest non-visual matching signals
    building_id     UUID        REFERENCES buildings(id) ON DELETE SET NULL,
    room_id         UUID        REFERENCES rooms(id)     ON DELETE SET NULL,
    location_note   TEXT,                            -- "2nd Floor Study Area"
    zone_code       TEXT,                            -- "Z-L2-NW-04"
    latitude        NUMERIC(10,7),
    longitude       NUMERIC(10,7),
    occurred_at     TIMESTAMPTZ NOT NULL,            -- when lost / when found

    reported_by     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    contact_pref    TEXT        NOT NULL DEFAULT 'in_app'
                     CHECK (contact_pref IN ('in_app','email','phone')),
    -- held by security desk / department office until collected
    holding_location TEXT,

    -- vision features used by the matcher
    image_phash     TEXT,
    image_embedding REAL[],                          -- optional CLIP-style vector
    ai_tags         TEXT[]      NOT NULL DEFAULT '{}',  -- {backpack,black,zipper}

    search_vector   tsvector,
    resolved_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_kind_status ON lf_items (organization_id, kind, status);
CREATE INDEX idx_lf_reporter    ON lf_items (reported_by, created_at DESC);
CREATE INDEX idx_lf_category    ON lf_items (category_id);
CREATE INDEX idx_lf_occurred    ON lf_items (occurred_at DESC);
CREATE INDEX idx_lf_search      ON lf_items USING GIN (search_vector);
CREATE INDEX idx_lf_trgm        ON lf_items USING GIN (title gin_trgm_ops, description gin_trgm_ops);

CREATE FUNCTION lf_search_trigger() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.brand,'') || ' ' || coalesce(NEW.colour,'')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.distinguishing_marks,'')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.location_note,'')), 'C');
    NEW.updated_at := now();
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lf_search
    BEFORE INSERT OR UPDATE OF title, description, brand, colour, distinguishing_marks, location_note
    ON lf_items FOR EACH ROW EXECUTE FUNCTION lf_search_trigger();

CREATE TABLE lf_attachments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id    UUID        NOT NULL REFERENCES lf_items(id) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    thumb_url  TEXT,
    filename   TEXT,
    phash      TEXT,
    is_primary BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lf_attach ON lf_attachments (item_id);

-- One row per (lost, found) pair the engine considers plausible.
CREATE TABLE lf_matches (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lost_item_id   UUID        NOT NULL REFERENCES lf_items(id) ON DELETE CASCADE,
    found_item_id  UUID        NOT NULL REFERENCES lf_items(id) ON DELETE CASCADE,
    score          NUMERIC(4,3) NOT NULL,             -- 0.940 -> "94%"
    -- the individual bars rendered on the AI Match Analysis panel
    image_score       NUMERIC(4,3),
    description_score NUMERIC(4,3),
    location_score    NUMERIC(4,3),
    category_score    NUMERIC(4,3),
    time_score        NUMERIC(4,3),
    reasoning      TEXT,
    ai_model       TEXT,
    status         match_status NOT NULL DEFAULT 'suggested',
    notified_at    TIMESTAMPTZ,
    reviewed_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lost_item_id, found_item_id)
);
CREATE INDEX idx_lf_match_score ON lf_matches (score DESC) WHERE status = 'suggested';
CREATE INDEX idx_lf_match_lost  ON lf_matches (lost_item_id);
CREATE INDEX idx_lf_match_found ON lf_matches (found_item_id);

CREATE TABLE lf_claims (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference     TEXT        NOT NULL UNIQUE,        -- CLM-2026-0044
    item_id       UUID        NOT NULL REFERENCES lf_items(id) ON DELETE CASCADE,
    match_id      UUID        REFERENCES lf_matches(id) ON DELETE SET NULL,
    claimant_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        claim_status NOT NULL DEFAULT 'submitted',
    -- ownership proof: answers to questions only the owner would know
    proof_note    TEXT,
    proof_urls    TEXT[]      NOT NULL DEFAULT '{}',
    verified_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    verified_at   TIMESTAMPTZ,
    rejection_reason TEXT,
    collected_at  TIMESTAMPTZ,
    -- signature/photo captured at handover
    handover_proof_url TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_claims_item     ON lf_claims (item_id);
CREATE INDEX idx_claims_claimant ON lf_claims (claimant_id, created_at DESC);
