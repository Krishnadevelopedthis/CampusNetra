-- ============================================================
-- Campus Netra — Migration 009: budgeted maintenance cost
--
-- Actual maintenance spend is already derived from completed work orders and
-- must stay that way: it is a fact about work that happened. What the asset
-- register was missing is the *expected* figure — the AMC or service contract
-- an asset is budgeted for — which is known at the moment the asset is
-- installed, long before any work order exists.
--
-- Keeping them apart is what lets the two be compared, which is the question
-- worth asking: is this asset costing more to keep than it was budgeted for?
-- ============================================================

ALTER TABLE assets
    ADD COLUMN annual_maintenance_cost NUMERIC(12,2),
    -- Warranty length as chosen, so the UI can show "3 years from purchase"
    -- rather than re-deriving it from two dates and guessing.
    ADD COLUMN warranty_months INT;
