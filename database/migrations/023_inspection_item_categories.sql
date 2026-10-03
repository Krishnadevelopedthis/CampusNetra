-- ============================================================
-- Campus Netra — Migration 023: one checklist, several categories
--
-- Each check in a checklist can belong to its own Issue Configuration
-- category ("Lights work" -> Electrical, "Projector works" -> AV). Scheduling
-- the checklist then creates one inspection per category, holding only that
-- category's checks, assigned to a technician who services it.
-- inspections.issue_category_id records which slice an inspection is.
--
-- Idempotent.
-- ============================================================

BEGIN;

ALTER TABLE inspection_template_items
    ADD COLUMN IF NOT EXISTS issue_category_id UUID REFERENCES issue_categories(id) ON DELETE SET NULL;

ALTER TABLE inspections
    ADD COLUMN IF NOT EXISTS issue_category_id UUID REFERENCES issue_categories(id) ON DELETE SET NULL;

COMMIT;
