-- ============================================================
-- Campus Netra — 001: Extensions & Enumerated Types
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy text search for L&F matching
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "citext";       -- case-insensitive emails

-- ---------- Identity ----------
CREATE TYPE user_role AS ENUM (
    'student',
    'teacher',
    'technician',
    'facility_manager',
    'admin',
    'super_admin'
);

CREATE TYPE user_status AS ENUM ('pending_verification', 'active', 'suspended', 'deactivated');

-- ---------- Spatial / Digital Twin ----------
-- Drives the floor-plan marker colours in the Digital Twin.
CREATE TYPE asset_state AS ENUM (
    'healthy',              -- green
    'warning',              -- amber
    'fault',                -- red
    'under_maintenance',    -- blue
    'inspection_required',  -- purple
    'decommissioned'        -- grey
);

CREATE TYPE room_kind AS ENUM (
    'classroom','lecture_hall','laboratory','office','library',
    'washroom','corridor','cafeteria','auditorium','hostel_room',
    'server_room','store','utility','other'
);

-- ---------- Issues ----------
CREATE TYPE issue_status AS ENUM (
    'reported',
    'triaged',
    'assigned',
    'in_progress',
    'on_hold',
    'resolved',
    'verified',
    'closed',
    'rejected',
    'duplicate'
);

CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');

-- ---------- Work Orders ----------
CREATE TYPE work_order_status AS ENUM (
    'draft','open','assigned','accepted','in_progress',
    'awaiting_parts','on_hold','completed','verified','closed','cancelled'
);

-- ---------- Inspections ----------
CREATE TYPE inspection_status AS ENUM ('scheduled','in_progress','submitted','approved','overdue','cancelled');
CREATE TYPE checklist_result  AS ENUM ('pass','fail','na','needs_attention');

-- ---------- Lost & Found ----------
CREATE TYPE lf_kind        AS ENUM ('lost','found');
CREATE TYPE lf_status      AS ENUM ('open','matched','claim_pending','claimed','returned','archived','expired');
CREATE TYPE claim_status   AS ENUM ('submitted','under_review','approved','rejected','collected');
CREATE TYPE match_status   AS ENUM ('suggested','notified','accepted','rejected','expired');

-- ---------- Platform ----------
CREATE TYPE notification_channel AS ENUM ('in_app','email','push','sms');
CREATE TYPE twin_event_kind AS ENUM (
    'asset_state_changed','issue_created','issue_status_changed',
    'work_order_created','work_order_status_changed','inspection_submitted',
    'sla_breached','asset_created','asset_moved','simulation'
);
