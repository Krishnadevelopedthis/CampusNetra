-- ============================================================
-- Campus Netra — Migration 018: one active session per account
--
-- users.session_id identifies the account's single live session. Every token
-- carries it (claim "sid"); a new login rotates it, so tokens held by the
-- previous device stop working immediately. session_end_reason records why
-- ('replaced' = signed in elsewhere, 'revoked' = signed out / password change /
-- admin action) so the old device can be told the right thing.
--
-- Both columns are nullable: accounts that have not signed in since this
-- migration keep working with their existing tokens until their next login.
-- Idempotent.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_end_reason text;
