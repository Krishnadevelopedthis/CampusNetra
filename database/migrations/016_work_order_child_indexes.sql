-- ============================================================
-- Campus Netra — Migration 016: missing work-order child-table indexes
--
-- A performance audit against the live schema (pg_indexes) found that
-- almost every FK/filter column already has a purpose-built index from
-- migrations 001-015 — composite, partial and GIN-trgm/full-text search
-- indexes already cover the real query patterns. The only genuine gaps
-- were these four child-detail tables, each queried by its parent id on
-- a work order's or inspection's detail page but never given an index
-- of their own (only their primary key was indexed).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wo_comments_wo ON work_order_comments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_attachments_wo ON work_order_attachments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_part_requests_wo ON part_requests(work_order_id);
CREATE INDEX IF NOT EXISTS idx_inspection_results_inspection ON inspection_results(inspection_id);
