-- ============================================================
-- Campus Netra — Migration 013: asset placement surface
--
-- pos_x/pos_y have always meant "normalised position on the floor plan".
-- Placing an asset on a wall or the ceiling needs a way to say which
-- surface those two numbers are measured against — without that, a wall
-- clock and a floor lamp are indistinguishable to the 3D scene beyond
-- their raw coordinates. Reusing pos_x/pos_y rather than adding pos_z:
--   floor / ceiling : pos_x, pos_y = horizontal plan position, as before
--   wall_*          : pos_x = position along the wall (0=left, 1=right
--                     when facing it), pos_y = height up the wall
--                     (0=floor, 1=ceiling)
-- Every existing asset is a floor placement, so the default backfills
-- correctly with no data migration needed beyond the column itself.
-- ============================================================

ALTER TABLE assets
    ADD COLUMN surface TEXT NOT NULL DEFAULT 'floor'
        CHECK (surface IN ('floor', 'wall_back', 'wall_left', 'wall_right', 'wall_front', 'ceiling'));
