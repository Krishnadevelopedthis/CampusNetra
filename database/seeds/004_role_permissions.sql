-- ============================================================
-- Campus Netra — Seed 004: role → permission mapping
--
-- The `role` column is the coarse gate enforced by route guards; these rows are
-- the fine-grained grants the Access Control screen renders and that
-- user_permission_overrides adjusts per person.
-- ============================================================

BEGIN;

-- Everyone who can sign in may report an issue, report lost property and see the twin.
INSERT INTO role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('student'::user_role), ('teacher'), ('technician'),
             ('facility_manager'), ('admin'), ('super_admin')) AS r(role)
CROSS JOIN permissions p
WHERE p.code IN ('issue.create', 'lf.report', 'twin.view')
ON CONFLICT DO NOTHING;

-- Technicians work the jobs.
INSERT INTO role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('technician'::user_role), ('facility_manager'), ('admin'), ('super_admin')) AS r(role)
CROSS JOIN permissions p
WHERE p.code IN ('issue.view_all', 'issue.resolve',
                 'workorder.update', 'inspection.submit')
ON CONFLICT DO NOTHING;

-- Facility managers assign work, verify it and run the numbers.
INSERT INTO role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('facility_manager'::user_role), ('admin'), ('super_admin')) AS r(role)
CROSS JOIN permissions p
WHERE p.code IN ('issue.assign', 'issue.verify',
                 'workorder.create', 'workorder.assign',
                 'inspection.schedule', 'lf.verify_claim',
                 'analytics.view', 'simulation.run')
ON CONFLICT DO NOTHING;

-- Admins configure the platform itself.
INSERT INTO role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('admin'::user_role), ('super_admin')) AS r(role)
CROSS JOIN permissions p
WHERE p.code IN ('twin.configure', 'user.manage', 'role.manage',
                 'settings.manage', 'audit.view')
ON CONFLICT DO NOTHING;

COMMIT;
