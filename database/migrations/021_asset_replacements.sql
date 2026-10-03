-- ============================================================
-- Campus Netra — Migration 021: replacing an asset during a repair
--
-- When a technician swaps a failed unit for a new one (a dead tube light for a
-- new tube light) the asset keeps its place, tag and QR code, but its make,
-- serial, purchase date, cost and warranty become the new unit's. The old
-- unit's details are kept here, one row per swap, so nothing is lost.
--
-- assets.installed_at records when the current physical unit went in, so
-- predictive maintenance stops counting the faults of the unit that was
-- thrown away.
--
-- Idempotent.
-- ============================================================

BEGIN;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS asset_replacements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id       UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    work_order_id  UUID        REFERENCES work_orders(id) ON DELETE SET NULL,
    replaced_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    replaced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_details    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    new_details    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_asset_replacements_asset
    ON asset_replacements (asset_id, replaced_at DESC);

COMMIT;
