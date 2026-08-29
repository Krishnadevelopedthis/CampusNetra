-- ============================================================
-- Campus Netra — Migration 008: academic programmes
--
-- `departments` is the maintenance org chart. Every routing decision in the
-- system points at it: an issue's owning team, a work order's team, an asset
-- category's default team, and the notification fan-out that tells a
-- department's members a fault has been reported.
--
-- A student's "department" is a different thing entirely — the course they are
-- enrolled on. Putting BSc IT in the same table would make it selectable as the
-- team responsible for a broken tap, and would notify every student on the
-- course about it. Programmes therefore get their own table.
-- ============================================================

CREATE TABLE academic_programmes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    code            TEXT        NOT NULL,
    -- Undergraduate, postgraduate, diploma… free text; institutions differ.
    level           TEXT,
    duration_years  NUMERIC(3,1),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, code)
);

CREATE INDEX idx_programme_org ON academic_programmes (organization_id) WHERE is_active;

-- Nulled rather than cascaded: retiring a course must not delete its alumni.
ALTER TABLE users
    ADD COLUMN programme_id UUID REFERENCES academic_programmes(id) ON DELETE SET NULL,
    ADD COLUMN academic_year INT;

CREATE INDEX idx_user_programme ON users (programme_id) WHERE programme_id IS NOT NULL;
