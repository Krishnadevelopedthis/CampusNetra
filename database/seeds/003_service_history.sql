-- ============================================================
-- Campus Netra — Seed 003: asset service history
--
-- Without a last_service_at, predictive maintenance falls back to the purchase
-- date and every asset reads as years overdue, which flattens the ranking and
-- makes the forecast useless. These values give the demo a realistic spread:
-- some assets recently serviced, some genuinely due, one badly neglected.
-- ============================================================

BEGIN;

UPDATE assets SET last_service_at = now() - INTERVAL '20 days'  WHERE tag = 'FAN-101-A';   -- fresh
UPDATE assets SET last_service_at = now() - INTERVAL '35 days'  WHERE tag = 'FAN-102-A';   -- fresh
UPDATE assets SET last_service_at = now() - INTERVAL '110 days' WHERE tag = 'AC-202-A';    -- overdue (90d interval)
UPDATE assets SET last_service_at = now() - INTERVAL '60 days'  WHERE tag = 'PRJ-202-1';   -- within 180d
UPDATE assets SET last_service_at = now() - INTERVAL '210 days' WHERE tag = 'P-101';       -- overdue
UPDATE assets SET last_service_at = now() - INTERVAL '400 days' WHERE tag = 'PC-201-01';   -- badly neglected
UPDATE assets SET last_service_at = now() - INTERVAL '45 days'  WHERE tag = 'NET-201-AP';
UPDATE assets SET last_service_at = now() - INTERVAL '30 days'  WHERE tag = 'NET-L2-AP';
UPDATE assets SET last_service_at = now() - INTERVAL '95 days'  WHERE tag = 'PLB-W1-T1';   -- overdue
UPDATE assets SET last_service_at = now() - INTERVAL '150 days' WHERE tag = 'LGT-103-1';

-- Give the oldest workstation a genuine repeat-failure history, so the
-- fault-history and MTBF signals have something to work with. Referencing an
-- existing reporter keeps the FK valid.
INSERT INTO issues (reference, organization_id, campus_id, title, description,
                    building_id, floor_id, room_id, asset_id, category_id, department_id,
                    priority, status, reported_by, created_at, resolved_at, closed_at)
SELECT
    'CMP-90' || gs,
    '11111111-1111-1111-1111-111111111111',
    '33333333-0000-0000-0000-000000000001',
    'Lab workstation freezing during practicals',
    'Machine locks up and needs a hard reboot. Recurring problem.',
    '44444444-0000-0000-0000-00000000000A',
    '55555555-0000-0000-0000-0000000000A2',
    '66666666-0000-0000-0000-000000000201',
    '88888888-0000-0000-0000-000000000005',
    '99999999-0000-0000-0000-000000000003',
    '22222222-0000-0000-0000-000000000003',
    'medium', 'closed',
    (SELECT id FROM users WHERE email = 'student@campus.edu'),
    now() - (gs * INTERVAL '38 days'),
    now() - (gs * INTERVAL '38 days') + INTERVAL '2 days',
    now() - (gs * INTERVAL '38 days') + INTERVAL '3 days'
FROM generate_series(1, 4) AS gs
ON CONFLICT (reference) DO NOTHING;

COMMIT;
