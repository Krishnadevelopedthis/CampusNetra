-- ============================================================
-- Campus Netra — Migration 019: referential integrity hardening
--
-- Result of a full audit of every foreign key (125) and the polymorphic
-- (entity_type, entity_id) references, which cannot have foreign keys:
--
--  1. assets.room_id is now NOT NULL with ON DELETE RESTRICT. An asset without
--     a room has no place on the twin or the map, and SET NULL on room deletion
--     was silently producing exactly those. The application removes a room's
--     assets explicitly first (with the admin's confirmation); the database now
--     refuses to leave them stranded on any other path.
--
--  2. Partial unique indexes make "one account per Student ID / Employee ID"
--     a database guarantee instead of only an application check. They apply to
--     live accounts only (pending registrations may repeat an ID until one is
--     verified) and, for student IDs, to student accounts only.
--
--  3. notifications carry an (entity_type, entity_id) pointer, so deleting the
--     thing they point at left dead links behind. AFTER DELETE triggers now
--     remove those notifications on every delete path, including cascades
--     (deleting a campus, building, room...). twin_events and audit_logs also
--     point at entities but are append-only history and are kept on purpose.
--
-- Idempotent.
-- ============================================================

BEGIN;

-- 1. Every asset lives in a room ---------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM assets WHERE room_id IS NULL) THEN
        RAISE EXCEPTION 'assets without a room exist; assign or remove them before applying this migration';
    END IF;
END $$;

ALTER TABLE assets ALTER COLUMN room_id SET NOT NULL;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_room_id_fkey;
ALTER TABLE assets ADD CONSTRAINT assets_room_id_fkey
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT;

-- 2. One live account per Student ID / Employee ID ---------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM users
        WHERE role = 'student' AND enrollment_no IS NOT NULL AND status IN ('active', 'suspended')
        GROUP BY organization_id, enrollment_no HAVING count(*) > 1
    ) THEN
        RAISE NOTICE 'duplicate live Student IDs exist; uq_users_student_enrollment NOT created';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_student_enrollment
            ON users (organization_id, enrollment_no)
            WHERE role = 'student' AND enrollment_no IS NOT NULL AND status IN ('active', 'suspended');
    END IF;

    IF EXISTS (
        SELECT 1 FROM users
        WHERE employee_id IS NOT NULL AND status IN ('active', 'suspended')
        GROUP BY organization_id, employee_id HAVING count(*) > 1
    ) THEN
        RAISE NOTICE 'duplicate live Employee IDs exist; uq_users_employee_id NOT created';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_id
            ON users (organization_id, employee_id)
            WHERE employee_id IS NOT NULL AND status IN ('active', 'suspended');
    END IF;
END $$;

-- 3. Notifications never outlive the thing they point at ---------------------
CREATE OR REPLACE FUNCTION trg_delete_entity_notifications() RETURNS trigger AS $$
BEGIN
    DELETE FROM notifications WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issues_notifications ON issues;
CREATE TRIGGER trg_issues_notifications AFTER DELETE ON issues
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('issue');

DROP TRIGGER IF EXISTS trg_work_orders_notifications ON work_orders;
CREATE TRIGGER trg_work_orders_notifications AFTER DELETE ON work_orders
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('work_order');

DROP TRIGGER IF EXISTS trg_inspections_notifications ON inspections;
CREATE TRIGGER trg_inspections_notifications AFTER DELETE ON inspections
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('inspection');

DROP TRIGGER IF EXISTS trg_lf_items_notifications ON lf_items;
CREATE TRIGGER trg_lf_items_notifications AFTER DELETE ON lf_items
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('lostfound_item');

DROP TRIGGER IF EXISTS trg_lf_claims_notifications ON lf_claims;
CREATE TRIGGER trg_lf_claims_notifications AFTER DELETE ON lf_claims
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('lf_claim');

DROP TRIGGER IF EXISTS trg_lf_matches_notifications ON lf_matches;
CREATE TRIGGER trg_lf_matches_notifications AFTER DELETE ON lf_matches
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('lf_match');

DROP TRIGGER IF EXISTS trg_assets_notifications ON assets;
CREATE TRIGGER trg_assets_notifications AFTER DELETE ON assets
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('asset');

DROP TRIGGER IF EXISTS trg_health_events_notifications ON health_events;
CREATE TRIGGER trg_health_events_notifications AFTER DELETE ON health_events
    FOR EACH ROW EXECUTE FUNCTION trg_delete_entity_notifications('health_event');

-- One-time sweep of notifications already orphaned before the triggers existed.
DELETE FROM notifications n WHERE n.entity_id IS NOT NULL AND (
       (n.entity_type = 'issue'          AND NOT EXISTS (SELECT 1 FROM issues t          WHERE t.id = n.entity_id))
    OR (n.entity_type = 'work_order'     AND NOT EXISTS (SELECT 1 FROM work_orders t     WHERE t.id = n.entity_id))
    OR (n.entity_type = 'inspection'     AND NOT EXISTS (SELECT 1 FROM inspections t     WHERE t.id = n.entity_id))
    OR (n.entity_type = 'lostfound_item' AND NOT EXISTS (SELECT 1 FROM lf_items t        WHERE t.id = n.entity_id))
    OR (n.entity_type = 'lf_claim'       AND NOT EXISTS (SELECT 1 FROM lf_claims t       WHERE t.id = n.entity_id))
    OR (n.entity_type = 'lf_match'       AND NOT EXISTS (SELECT 1 FROM lf_matches t      WHERE t.id = n.entity_id))
    OR (n.entity_type = 'asset'          AND NOT EXISTS (SELECT 1 FROM assets t          WHERE t.id = n.entity_id))
    OR (n.entity_type = 'health_event'   AND NOT EXISTS (SELECT 1 FROM health_events t   WHERE t.id = n.entity_id))
);

COMMIT;
