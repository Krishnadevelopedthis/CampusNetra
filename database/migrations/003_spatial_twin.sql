-- ============================================================
-- Campus Netra — 003: Spatial Hierarchy & Digital Twin
-- Campus > Building > Floor > Room > Asset
-- ============================================================

CREATE TABLE campuses (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    code             TEXT        NOT NULL,
    address          TEXT,
    latitude         NUMERIC(10,7),
    longitude        NUMERIC(10,7),
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, code)
);

CREATE TABLE buildings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id     UUID        NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,          -- "Bldg A (Engineering)"
    code          TEXT        NOT NULL,          -- "A"
    floors_count  INT         NOT NULL DEFAULT 1,
    -- position on the campus map (normalised 0..1 so it is resolution independent)
    map_x         NUMERIC(6,5),
    map_y         NUMERIC(6,5),
    latitude      NUMERIC(10,7),
    longitude     NUMERIC(10,7),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campus_id, code)
);

CREATE TABLE floors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id     UUID        NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,        -- "Floor 2"
    level           INT         NOT NULL,        -- 0 = ground, -1 = basement
    -- uploaded floor-plan raster/vector that rooms are drawn on top of
    floor_plan_url  TEXT,
    plan_width      INT,                          -- native px of the plan image
    plan_height     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (building_id, level)
);

CREATE TABLE rooms (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id     UUID        NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,           -- "Class 202"
    code         TEXT        NOT NULL,           -- "A-101"
    -- deterministic twin id shown in the UI: ZN-BLDA-F2-202
    zone_id      TEXT,
    kind         room_kind   NOT NULL DEFAULT 'classroom',
    capacity     INT,
    area_sqft    NUMERIC(10,2),
    -- room outline on the floor plan: [[x,y],[x,y],…] normalised 0..1
    boundary     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (floor_id, code)
);
CREATE INDEX idx_rooms_floor ON rooms (floor_id);

CREATE TABLE asset_categories (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,           -- Projector, AC Unit, Lighting…
    code             TEXT    NOT NULL,           -- PRJ, AC, LGT
    icon             TEXT,                       -- lucide icon name used by the frontend
    -- which department owns faults on this category (drives auto-routing)
    default_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    default_priority priority_level NOT NULL DEFAULT 'medium',
    UNIQUE (organization_id, code)
);

CREATE TABLE assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID        REFERENCES rooms(id) ON DELETE SET NULL,
    category_id     UUID        NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
    -- human-facing tag rendered on the twin: "P-101", "AC-202-A"
    tag             TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    manufacturer    TEXT,
    model           TEXT,
    serial_no       TEXT,

    state           asset_state NOT NULL DEFAULT 'healthy',
    -- position inside the room on the floor plan, normalised 0..1
    pos_x           NUMERIC(6,5),
    pos_y           NUMERIC(6,5),

    purchase_date   DATE,
    warranty_expiry DATE,
    cost            NUMERIC(12,2),
    -- predictive maintenance inputs
    last_service_at TIMESTAMPTZ,
    service_interval_days INT,
    expected_life_months  INT,
    meta            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tag)
);
CREATE INDEX idx_assets_room     ON assets (room_id);
CREATE INDEX idx_assets_state    ON assets (state) WHERE state <> 'healthy';
CREATE INDEX idx_assets_category ON assets (category_id);

-- Every state transition is retained so the twin can be replayed at any timestamp.
CREATE TABLE asset_state_history (
    id          BIGSERIAL PRIMARY KEY,
    asset_id    UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    from_state  asset_state,
    to_state    asset_state NOT NULL,
    reason      TEXT,
    issue_id    UUID,                              -- FK added in 004
    work_order_id UUID,                            -- FK added in 005
    changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_asset_hist ON asset_state_history (asset_id, changed_at DESC);

-- ---------- Event store powering Live State / Replay / Comparison ----------
CREATE TABLE twin_events (
    id          BIGSERIAL PRIMARY KEY,
    campus_id   UUID        NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
    kind        twin_event_kind NOT NULL,
    entity_type TEXT        NOT NULL,             -- 'asset' | 'issue' | 'work_order' …
    entity_id   UUID        NOT NULL,
    room_id     UUID        REFERENCES rooms(id) ON DELETE SET NULL,
    payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    -- simulation events are tagged so they never pollute real analytics
    simulation_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_twin_events_replay ON twin_events (campus_id, occurred_at DESC);
CREATE INDEX idx_twin_events_entity ON twin_events (entity_type, entity_id);
CREATE INDEX idx_twin_events_sim    ON twin_events (simulation_id) WHERE simulation_id IS NOT NULL;
