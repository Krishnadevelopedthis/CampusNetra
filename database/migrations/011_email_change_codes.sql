-- ============================================================
-- Campus Netra — Migration 011: email-change codes
--
-- Moving an account to a new address is confirmed with a code sent to that
-- address, and those codes live alongside the others in verification_codes.
-- The purpose check predates the flow, so every attempt to issue one failed.
-- ============================================================

ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS verification_codes_purpose_check;
ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_purpose_check
    CHECK (purpose IN ('email_verify','password_reset','phone_verify','mfa','email_change'));
