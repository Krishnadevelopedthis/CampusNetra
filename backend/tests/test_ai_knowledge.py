"""Tests for app/ai/knowledge.py — the static Knowledge Map behind the
agent's general "how do I / what is / why is" answers, distinct from the
tools that fetch a user's actual live data."""
import pytest

from app.ai.knowledge import KNOWLEDGE_MAP, SUPPORT_FALLBACK, render_knowledge


def test_render_knowledge_does_not_crash_and_produces_text():
    text = render_knowledge()
    assert isinstance(text, str)
    assert len(text) > 500  # a real knowledge map, not an empty stub


def test_render_knowledge_has_no_stray_empty_bullets():
    # Regression: the "roles" section has a different shape (flat
    # name -> description) than every other section (what/who/where/...),
    # and the generic renderer used to fall through to an empty bullet
    # for it before that shape was handled explicitly.
    for line in render_knowledge().split("\n"):
        assert line.strip() != "-"


@pytest.mark.parametrize("term", [
    "complaint", "Lost & Found", "Digital Twin", "SLA",
    "student", "technician", "admin",
])
def test_render_knowledge_covers_the_major_features(term):
    assert term.lower() in render_knowledge().lower()


def test_role_descriptions_cover_every_real_role():
    # Cross-checked against the actual UserRole enum, not just this file's
    # own idea of what the roles are.
    from app.core.enums import UserRole

    rendered = render_knowledge()
    for role in UserRole:
        assert role.value in rendered


def test_support_fallback_uses_the_configured_email_not_a_hardcoded_one():
    from app.core.config import settings

    assert settings.SUPPORT_EMAIL in SUPPORT_FALLBACK


def test_knowledge_map_sections_have_the_expected_shape():
    for name, section in KNOWLEDGE_MAP.items():
        if name == "roles":
            assert all(isinstance(v, str) for v in section.values())
        else:
            assert "what" in section, f"{name} is missing a 'what' entry"


def test_agent_system_prompt_actually_includes_the_knowledge_map():
    from app.api.v1.ai import AGENT_SYSTEM

    assert render_knowledge() in AGENT_SYSTEM


def test_agent_system_prompt_includes_the_support_fallback_instruction():
    from app.api.v1.ai import AGENT_SYSTEM
    from app.core.config import settings

    assert settings.SUPPORT_EMAIL in AGENT_SYSTEM
    assert "don't have enough verified information" in AGENT_SYSTEM
