from datetime import date, timedelta
import json
import logging
from pathlib import Path

import pytest

from app.internal_logger import INTERNAL_LOGGER_NAME, log_internal_issue
from app.models import TravelRequest, Trip
from app.privacy_gateway import PrivacyGatewayError, anonymize_for_external_ai, assert_no_raw_pii, rehydrate_from_vault
from app.security import SensitiveFieldCipher, SecurityError, create_access_token, public_error_message, redact_sensitive_text, risk_label, verify_access_token
from app.store import TravelStore


def test_redact_sensitive_text_masks_private_identifiers():
    text = (
        "Email traveler@example.com phone +91 98765 43210 passport A1234567 "
        "Authorization: Bearer sk-or-v1-secretvalue and token sk-live-abcdef1234567890"
    )

    redacted = redact_sensitive_text(text)

    assert "traveler@example.com" not in redacted
    assert "+91 98765 43210" not in redacted
    assert "A1234567" not in redacted
    assert "sk-or-v1-secretvalue" not in redacted
    assert "sk-live-abcdef1234567890" not in redacted
    assert "[redacted-email]" in redacted
    assert "[redacted-phone]" in redacted
    assert "[redacted-id]" in redacted
    assert "[redacted-token]" in redacted


def test_privacy_gateway_tokenizes_and_rehydrates_structured_pii(monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    payload = {
        "traveller_details": {
            "traveler_name": "Anika Rao",
            "traveler_email": "anika.rao@unipro.com",
            "phone": "+91 98765 43210",
            "employee_id": "E-101",
            "passport_number": "Z1234567",
        },
        "customer_message": "Email Anika Rao at anika.rao@unipro.com about passport Z1234567.",
    }

    result = anonymize_for_external_ai(payload)
    serialized = json.dumps(result.payload)

    for raw_value in ("Anika Rao", "anika.rao@unipro.com", "+91 98765 43210", "E-101", "Z1234567"):
        assert raw_value not in serialized
    assert "PERSON_" in serialized
    assert "EMAIL_" in serialized
    assert "PHONE_" in serialized
    assert "EMPLOYEE_ID_" in serialized
    assert "PASSPORT_" in serialized
    assert_no_raw_pii(result.payload, result.token_map)

    rehydrated = rehydrate_from_vault(result.payload, result.token_map)
    assert rehydrated["traveller_details"]["traveler_name"] == "Anika Rao"
    assert rehydrated["traveller_details"]["traveler_email"] == "anika.rao@unipro.com"
    assert rehydrated["customer_message"] == "Email Anika Rao at anika.rao@unipro.com about passport Z1234567."


def test_privacy_gateway_blocks_unmapped_outbound_pii(monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    result = anonymize_for_external_ai({"traveller_details": {"traveler_name": "Anika Rao"}})

    with pytest.raises(PrivacyGatewayError) as exc:
        assert_no_raw_pii({"message": "Outbound leak to leak@example.com"}, result.token_map)

    assert "email" in str(exc.value).lower()
    assert "leak@example.com" not in str(exc.value)


def test_internal_logger_records_sanitized_structured_issue(caplog):
    logger = logging.getLogger(INTERNAL_LOGGER_NAME)
    caplog.set_level(logging.WARNING, logger=INTERNAL_LOGGER_NAME)

    payload = log_internal_issue(
        logger,
        "privacy.gateway.blocked",
        "Blocked traveler anika.rao@unipro.com phone +91 98765 43210 passport Z1234567",
        request_id="corp_req_test",
        error=RuntimeError("api key sk-live-abcdef1234567890 failed"),
    )

    assert payload["event_type"] == "privacy.gateway.blocked"
    assert payload["request_id"] == "corp_req_test"
    assert payload["error_type"] == "RuntimeError"
    assert "anika.rao@unipro.com" not in caplog.text
    assert "+91 98765 43210" not in caplog.text
    assert "Z1234567" not in caplog.text
    assert "sk-live-abcdef1234567890" not in caplog.text
    assert "[redacted-email]" in caplog.text
    assert "[redacted-phone]" in caplog.text
    assert "[redacted-id]" in caplog.text


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


def test_access_tokens_are_short_lived_and_reject_expired_tokens(monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    token, context = create_access_token("demo.user@unipro.com", ttl_seconds=60)

    verified = verify_access_token(token)

    assert verified.user_id == context.user_id
    expired, _ = create_access_token("demo.user@unipro.com", ttl_seconds=-1)
    try:
        verify_access_token(expired)
    except SecurityError as exc:
        assert "expired" in str(exc).lower()
    else:
        raise AssertionError("expired token was accepted")


def test_sensitive_payloads_are_encrypted_outside_public_trip_json(tmp_path, monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    store = TravelStore(tmp_path / "travel_ai.db")
    trip = Trip(
        owner_id="usr_demo",
        owner_department="sales",
        request=TravelRequest(
            origin="SFO",
            destination="Tokyo, Japan",
            depart_date=date.today() + timedelta(days=14),
            travelers=1,
        ),
        sensitive_context={"passport_number": "A1234567", "calendar_event": "Board meeting with client"},
    )

    store.save_trip(trip)
    raw_db = Path(tmp_path / "travel_ai.db").read_bytes()

    assert b"A1234567" not in raw_db
    assert b"Board meeting" not in raw_db
    listed = store.list_trips_for_owner("usr_demo")
    assert listed[0].sensitive_context == {}
    with store._connect() as conn:
        encrypted = conn.execute("SELECT sensitive_payload_json FROM trips WHERE id = ?", (trip.id,)).fetchone()[0]
    decrypted = SensitiveFieldCipher().decrypt_json(encrypted)
    assert decrypted["passport_number"] == "A1234567"


def test_llm_agent_module_does_not_import_storage_or_sqlite():
    agent_source = Path("backend/app/agent.py").read_text()

    assert "TravelStore" not in agent_source
    assert "sqlite3" not in agent_source
