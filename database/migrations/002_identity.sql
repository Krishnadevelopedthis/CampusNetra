-- ============================================================
-- Campus Netra — 002: Identity, Tenancy, Roles & Permissions
-- ============================================================

-- An "enterprise" is the college/university tenant that registers on the platform.
CREATE TABLE organizations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT        NOT NULL,
    slug              CITEXT      UNIQUE,
    email_domain      TEXT,                       -- auto-approve @vit.ac.in style signups
    contact_email     TEXT        NOT NULL,
    contact_phone     TEXT,
    address           TEXT,
    logo_url          TEXT,                       -- placeholder: user supplies the Campus Netra logo
    timezone          TEXT        NOT NULL DEFAULT 'Asia/Kolkata',
    is_verified       BOOLEAN     NOT NULL DEFAULT FALSE,
    settings          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,       -- Electrical, Plumbing, IT Support, AV, Civil…
    code              TEXT        NOT NULL,       -- ELEC, PLUMB, IT, AV, CIVIL
    description       TEXT,
    email             TEXT,
    escalation_email  TEXT,
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, code)
);

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
    email               CITEXT      NOT NULL UNIQUE,
    phone               TEXT,
    password_hash       TEXT        NOT NULL,
    full_name           TEXT        NOT NULL,
    role                user_role   NOT NULL DEFAULT 'student',
    status              user_status NOT NULL DEFAULT 'pending_verification',
    department_id       UUID        REFERENCES departments(id) ON DELETE SET NULL,

    -- role-specific identifiers
    enrollment_no       TEXT,       -- student
    employee_id         TEXT,       -- teacher / technician / staff
    designation         TEXT,
    specialization      TEXT[],     -- technician skills: {electrical,plumbing}

    avatar_url          TEXT,
    email_verified_at   TIMESTAMPTZ,
    phone_verified_at   TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    failed_login_count  INT         NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    preferences         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_org_role   ON users (organization_id, role) WHERE status = 'active';
CREATE INDEX idx_users_department ON users (department_id);

-- Fine-grained permissions on top of the coarse `role` column.
CREATE TABLE permissions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT UNIQUE NOT NULL,    -- 'issue.assign', 'twin.configure', 'user.deactivate'
    module       TEXT NOT NULL,
    description  TEXT
);

CREATE TABLE role_permissions (
    role          user_role NOT NULL,
    permission_id UUID      NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- Per-user grants/revokes that override the role default.
CREATE TABLE user_permission_overrides (
    user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID    NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted       BOOLEAN NOT NULL,
    PRIMARY KEY (user_id, permission_id)
);

-- ---------- Auth artefacts ----------
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    user_agent  TEXT,
    ip_address  INET,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- Serves both email verification OTP and password reset.
CREATE TABLE verification_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     TEXT        NOT NULL CHECK (purpose IN ('email_verify','password_reset','phone_verify','mfa')),
    code_hash   TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts    INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_lookup ON verification_codes (user_id, purpose) WHERE consumed_at IS NULL;
