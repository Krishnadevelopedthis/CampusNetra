-- ============================================================
-- Campus Netra — Seed 005: completed maintenance history
--
-- The cost reporting counts only completed work, which is correct — a job's
-- cost is not final until sign-off — but it leaves the expense screens empty
-- on a fresh install, where "no data" is indistinguishable from "broken".
--
-- This backfills eighteen months of finished jobs against the seeded assets,
-- with costs that vary by trade and a couple of assets deliberately made
-- expensive so the repeat-offender ranking has something to rank.
--
-- Dates are relative to the seed run, so the series always ends at the current
-- month rather than trailing off years in the past.
-- ============================================================

BEGIN;

WITH params AS (
  SELECT
    (SELECT id FROM organizations LIMIT 1)                             AS org_id,
    (SELECT id FROM users WHERE email = 'rahul.elec@campus.edu')       AS tech_elec,
    (SELECT id FROM users WHERE email = 'facility@campus.edu')         AS manager
),
-- One job per asset per month, skipping months at a rate that differs by asset
-- so the series is uneven the way real maintenance is.
plan AS (
  SELECT
    a.id                                  AS asset_id,
    a.tag,
    m                                     AS months_ago,
    row_number() OVER ()                  AS seq,
    CASE
      WHEN a.tag LIKE 'AC-%'   THEN 2400 + (m % 5) * 380
      WHEN a.tag LIKE 'PC-%'   THEN 1800 + (m % 4) * 650
      WHEN a.tag LIKE 'P-%'    THEN 1500 + (m % 3) * 400
      WHEN a.tag LIKE 'PRJ-%'  THEN 2100 + (m % 4) * 300
      WHEN a.tag LIKE 'NET-%'  THEN  900 + (m % 3) * 250
      WHEN a.tag LIKE 'PLB-%'  THEN 1200 + (m % 4) * 275
      ELSE                           450 + (m % 6) * 120
    END                                   AS labour,
    CASE
      WHEN a.tag LIKE 'AC-%'   THEN 3200 + (m % 4) * 900
      WHEN a.tag LIKE 'PC-%'   THEN 2600 + (m % 5) * 700
      WHEN a.tag LIKE 'PRJ-%'  THEN 4100 + (m % 3) * 1200
      ELSE                            300 + (m % 5) * 180
    END                                   AS parts
  FROM assets a
  CROSS JOIN generate_series(0, 17) AS m
  -- The neglected workstation and the overdue AC get worked on nearly every
  -- month; everything else is occasional. hashtext keeps it deterministic.
  WHERE (a.tag IN ('PC-201-01', 'AC-202-A') AND m % 2 = 0)
     OR (abs(hashtext(a.tag || m::text)) % 5 = 0)
)
INSERT INTO work_orders (
  reference, organization_id, asset_id, title, description,
  status, priority, assigned_to, assigned_by, verified_by,
  labour_cost, parts_cost, created_at, completed_at, verified_at, department_id
)
SELECT
  'WO-9' || lpad(p.seq::text, 3, '0'),
  params.org_id,
  p.asset_id,
  CASE
    WHEN p.tag LIKE 'AC-%'  THEN 'Air conditioning service'
    WHEN p.tag LIKE 'PC-%'  THEN 'Workstation repair'
    WHEN p.tag LIKE 'P-%'   THEN 'Pump servicing'
    WHEN p.tag LIKE 'PRJ-%' THEN 'Projector lamp and filter'
    WHEN p.tag LIKE 'NET-%' THEN 'Access point maintenance'
    WHEN p.tag LIKE 'PLB-%' THEN 'Plumbing repair'
    ELSE 'Routine maintenance'
  END,
  'Scheduled maintenance completed and signed off.',
  'verified',
  'medium',
  params.tech_elec,
  params.manager,
  params.manager,
  p.labour,
  p.parts,
  date_trunc('month', now()) - (p.months_ago || ' months')::interval + INTERVAL '3 days',
  date_trunc('month', now()) - (p.months_ago || ' months')::interval + INTERVAL '5 days',
  date_trunc('month', now()) - (p.months_ago || ' months')::interval + INTERVAL '5 days',
  (SELECT department_id FROM users u WHERE u.id = params.tech_elec)
FROM plan p CROSS JOIN params
ON CONFLICT (reference) DO NOTHING;

COMMIT;
