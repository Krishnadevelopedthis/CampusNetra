-- ============================================================
-- Campus Netra — Migration 017: technicians register by issue category
--
-- Technicians now register against Admin → Issue Configuration categories
-- rather than a department, and work orders route to whoever services the
-- issue's category. users.specialization holds those category codes.
-- Existing accounts may carry older free-text tags ('electrical',
-- 'plumbing', ...). For each tag:
--   1. if it already is a category code in the user's organization, keep it;
--   2. otherwise, if it is a known legacy tag, map it to that category code
--      (only if the organization has such a category);
--   3. otherwise drop it.
-- Technicians with no recognisable tag are left untouched — they still route
-- through their department, which remains the fallback.
--
-- Idempotent: re-running it changes nothing further.
-- ============================================================

BEGIN;

WITH mapping(tag, code) AS (VALUES
    ('electrical', 'ELEC'), ('electrician', 'ELEC'),
    ('hvac', 'HVAC'), ('ac', 'HVAC'),
    ('plumbing', 'PLUMB'), ('plumber', 'PLUMB'),
    ('network', 'IT'), ('it', 'IT'),
    ('av', 'AV'), ('projector', 'AV'),
    ('furniture', 'FRN'), ('carpenter', 'FRN'),
    ('civil', 'CIVIL'),
    ('housekeeping', 'HK')
),
resolved AS (
    SELECT u.id, array_agg(DISTINCT c.code ORDER BY c.code) AS codes
    FROM users u
    CROSS JOIN LATERAL unnest(u.specialization) AS t(tag)
    LEFT JOIN mapping m ON m.tag = lower(t.tag)
    JOIN issue_categories c
      ON c.organization_id = u.organization_id
     AND c.code = CASE
           WHEN EXISTS (
               SELECT 1 FROM issue_categories x
               WHERE x.organization_id = u.organization_id AND x.code = t.tag
           ) THEN t.tag
           ELSE m.code
         END
    WHERE u.role = 'technician'
    GROUP BY u.id
)
UPDATE users u
   SET specialization = r.codes
  FROM resolved r
 WHERE u.id = r.id
   AND u.specialization IS DISTINCT FROM r.codes;

COMMIT;
