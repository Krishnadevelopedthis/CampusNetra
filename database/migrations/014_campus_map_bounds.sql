-- ============================================================
-- Campus Netra — Migration 014: campus outdoor-map bounds
--
-- latitude/longitude alone gave the outdoor map a centre point but no say
-- over how much of the surrounding area to actually show — every campus
-- got the same fixed-radius box regardless of its real size or shape, and
-- there was no way for an admin to say "only this much, not the road on
-- the far side of town". map_bounds is the exact area an admin searched
-- for and then cropped on the outdoor map, as {south, west, north, east}
-- in decimal degrees. NULL (the default for every existing campus) means
-- "no custom crop yet" — OutdoorCampusMap.jsx falls back to a generous
-- fixed-radius box around latitude/longitude in that case, so nothing
-- breaks for a campus that hasn't been cropped.
-- ============================================================

ALTER TABLE campuses
    ADD COLUMN map_bounds JSONB NULL;
