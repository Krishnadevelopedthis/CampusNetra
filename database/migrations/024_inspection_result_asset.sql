-- ============================================================
-- Campus Netra — Migration 024: which asset a checklist answer is about
--
-- A room inspection covers many assets. When a check is marked Fail or
-- Attention the inspector names the asset concerned, so an Attention can mark
-- exactly that asset as Warning (and a failed critical check files its
-- complaint against it).
--
-- Idempotent.
-- ============================================================

BEGIN;

ALTER TABLE inspection_results
    ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;

COMMIT;
