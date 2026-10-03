-- ============================================================
-- Campus Netra — Migration 022: inspection checklists know their category
--
-- A checklist ("Electrical Safety Check") belongs to one Issue Configuration
-- category, the same list technicians register against. Scheduling an
-- inspection from it then assigns a technician who services that category.
-- The older category_id column points at asset categories and stays as is.
--
-- Idempotent.
-- ============================================================

BEGIN;

ALTER TABLE inspection_templates
    ADD COLUMN IF NOT EXISTS issue_category_id UUID REFERENCES issue_categories(id) ON DELETE SET NULL;

COMMIT;
