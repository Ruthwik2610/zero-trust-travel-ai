from datetime import date, timedelta

from app.models import TravelRequest
from app.security import public_error_message, redact_sensitive_text, risk_label


def test_redact_sensitive_text_masks_private_identifiers():
    text = (
        "Email traveler@example.com passport A1234567 "
        "Authorization: Bearer sk-or-v1-secretvalue and token sk-live-abcdef1234567890"
    )

    redacted = redact_sensitive_text(text)

    assert "traveler@example.com" not in redacted
    assert "A1234567" not in redacted
    assert "sk-or-v1-secretvalue" not in redacted
    assert "sk-live-abcdef1234567890" not in redacted
    assert "[redacted-email]" in redacted
    assert "[redacted-id]" in redacted
    assert "[redacted-token]" in redacted


def test_public_error_message_never_returns_internal_text():
    exc = RuntimeError("OPENROUTER_API_KEY missing for traveler@example.com")

    assert public_error_message(exc) == "We could not complete that request safely. Please try again."


def test_risk_label_escalates_for_international_premium_short_window_and_budget():
    request = TravelRequest(
        origin="SFO",
        destination="Tokyo, Japan",
        depart_date=date.today() + timedelta(days=2),
        return_date=date.today() + timedelta(days=7),
        travelers=1,
        cabin="business",
        budget_usd=800,
    )

    assert risk_label(request) == "high"

