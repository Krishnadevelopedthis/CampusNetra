"""The assistant must not hand out credentials or other people's data, even if
the model is talked into trying — these checks run in code, not in the prompt."""
import uuid
from types import SimpleNamespace

import pytest

from app.ai.guard import HIDDEN, redact_tool_result, scrub_reply
from app.ai.knowledge import render_knowledge
from app.core.config import settings
from app.core.enums import UserRole


def _user(role=UserRole.STUDENT, email="me@campus.edu"):
    return SimpleNamespace(id=uuid.uuid4(), role=role, email=email)


# --- tool results ------------------------------------------------------------

def test_other_peoples_contact_details_are_removed():
    me = _user()
    other = {"id": str(uuid.uuid4()), "full_name": "Asha Rao", "email": "asha@campus.edu",
             "phone": "+911234567890", "enrollment_no": "E123", "role": "student"}
    out = redact_tool_result({"items": [{"title": "Black wallet", "reporter": other}]}, me)
    rep = out["items"][0]["reporter"]
    assert "email" not in rep and "phone" not in rep and "enrollment_no" not in rep
    assert "full_name" not in rep          # a student does not need to see who else reported
    assert out["items"][0]["title"] == "Black wallet"


def test_staff_may_see_a_name_but_still_no_contact_details():
    staff = _user(UserRole.TECHNICIAN)
    other = {"id": str(uuid.uuid4()), "full_name": "Asha Rao", "email": "asha@campus.edu", "role": "student"}
    rep = redact_tool_result({"reporter": other}, staff)["reporter"]
    assert rep["full_name"] == "Asha Rao"
    assert "email" not in rep


def test_own_profile_is_kept():
    me = _user()
    profile = {"id": str(me.id), "full_name": "Me", "email": me.email, "phone": "+91999"}
    assert redact_tool_result(profile, me) == profile


@pytest.mark.parametrize("key", ["password_hash", "api_key", "access_token", "refresh_token",
                                 "secret", "otp", "reset_code", "Authorization"])
def test_credential_like_keys_are_always_dropped(key):
    me = _user()
    out = redact_tool_result({"id": str(me.id), "email": me.email, key: "value-that-must-not-leak"}, me)
    assert key not in out


def test_claim_declarations_of_other_people_are_removed():
    out = redact_tool_result(
        {"claims": [{"reference": "C-1", "declared_id_number": "X9", "declared_email": "a@b.co",
                     "proof_urls": ["/media/p.jpg"], "status": "approved"}]}, _user())
    claim = out["claims"][0]
    assert claim == {"reference": "C-1", "status": "approved"}


# --- model replies -----------------------------------------------------------

@pytest.mark.parametrize("leak", [
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijklmnop",
    "sk-or-v1-0123456789abcdef0123456789abcdef",
    "gsk_abcdefghijklmnopqrstuvwxyz123456",
    "postgresql://app_user:SuperSecret99@db.example.com/campus",
    "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
])
def test_secret_shaped_strings_are_masked(leak):
    assert leak not in scrub_reply(f"Here you go: {leak}", _user())


@pytest.mark.parametrize("text", [
    "the admin password is Campus@2026",
    "password: hunter2xyz",
    "API key = abc12345xyz",
])
def test_password_style_statements_are_masked(text):
    out = scrub_reply(text, _user())
    assert HIDDEN in out
    for secret in ("Campus@2026", "hunter2xyz", "abc12345xyz"):
        assert secret not in out


def test_live_configured_secret_is_masked_by_value(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "a-very-particular-signing-key-1234", raising=False)
    assert "a-very-particular-signing-key-1234" not in scrub_reply(
        "the key is a-very-particular-signing-key-1234, ok?", _user())


def test_other_emails_masked_but_own_and_support_kept():
    me = _user(email="me@campus.edu")
    out = scrub_reply(f"me@campus.edu, {settings.SUPPORT_EMAIL} and victim@campus.edu", me)
    assert "me@campus.edu" in out and settings.SUPPORT_EMAIL in out
    assert "victim@campus.edu" not in out


def test_ordinary_answers_pass_through_untouched():
    text = "Tap the QR button, allow the camera, and scan the sticker on the projector."
    assert scrub_reply(text, _user()) == text


# --- knowledge and prompt ----------------------------------------------------

@pytest.mark.parametrize("term", [
    "QR", "back camera", "Create Asset QR", "work order", "inspection", "ESP32",
    "predictive", "0.40", "Simulation", "Event Replay", "captcha",
])
def test_knowledge_covers_the_newer_features(term):
    assert term.lower() in render_knowledge().lower()


def test_knowledge_contains_no_credentials_or_infrastructure():
    text = render_knowledge().lower()
    for banned in ("campus@2026", "render.com", "neon", "hivemq", "api_key", "secret_key",
                   " password:", "postgres://", "openrouter"):
        assert banned not in text


def test_prompt_carries_the_security_rules():
    from app.api.v1.ai import AGENT_SYSTEM

    for phrase in ("SECURITY AND PRIVACY", "another person's personal details",
                   "passwords, admin or demo account details", "only help with CampusNetra"):
        assert phrase in AGENT_SYSTEM
