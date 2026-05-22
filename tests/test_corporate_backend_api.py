from datetime import date, timedelta
from io import BytesIO
import base64
import hashlib
import hmac
import json

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from app.main import app
from app.security import create_access_token


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_DB_PATH", str(tmp_path / "travel_ai.db"))
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    for name in ("DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "DUFFEL_API_TOKEN", "BOOKING_COM_TOKEN", "BOOKING_COM_AFFILIATE_ID", "RAPIDAPI_BOOKING_KEY"):
        monkeypatch.delenv(name, raising=False)
    return TestClient(app)


def _headers(email="demo.user@unipro.com", purpose="manage corporate travel request"):
    token, _ = create_access_token(email)
    return {"Authorization": f"Bearer {token}", "X-Travel-Purpose": purpose}


def _corporate_payload(total_budget=2500, passport_expiry=None, visa_expiry=None):
    depart = date.today() + timedelta(days=45)
    ret = depart + timedelta(days=4)
    return {
        "traveller_details": {
            "traveler_name": "Anika Rao",
            "traveler_email": "anika.rao@unipro.com",
            "phone": "+91 98765 43210",
            "employee_id": "E-101",
            "employee_level": "manager",
            "department": "sales",
            "nationality": "India",
            "passport_expiry": str(passport_expiry or ret + timedelta(days=220)),
            "visa_status": "Valid visa on file",
            "visa_expiry": str(visa_expiry or ret + timedelta(days=30)),
            "medical_notes": "none",
            "accessibility_notes": "none",
        },
        "company_details": {
            "company_name": "Unipro",
            "cost_center": "SALES-42",
            "approving_manager": "Travel Manager",
            "approval_manager_email": "manager@unipro.com",
            "policy_tier": "standard",
        },
        "travel_details": {
            "origin": "Hyderabad",
            "destination": "Johannesburg",
            "destination_country": "South Africa",
            "depart_date": str(depart),
            "return_date": str(ret),
            "trip_purpose": "client workshops",
            "meeting_location": "Sandton client office",
            "flexible_dates": True,
            "travelers": 1,
            "cabin": "economy",
        },
        "preferences": {
            "preferred_airline": "Qatar Airways",
            "flight_preference": "short layover",
            "hotel_preference": "business hotel",
            "preferred_hotel_area": "Sandton",
            "hotel_star_rating": "4",
            "past_hotel_preference": "Garden Court",
            "airport_transfer_needed": True,
        },
        "budgets": {"total_budget": total_budget, "currency": "USD", "extra_baggage_notes": "one sample kit"},
        "special_requests": ["late check-in", "quiet room"],
    }


def _workbook_bytes():
    depart = date.today() + timedelta(days=45)
    ret = depart + timedelta(days=4)
    wb = Workbook()
    ws = wb.active
    ws.title = "Travel Requests"
    ws.append(
        [
            "traveler_name",
            "traveler_email",
            "phone",
            "employee_id",
            "employee_level",
            "nationality",
            "origin",
            "destination",
            "destination_country",
            "depart_date",
            "return_date",
            "trip_purpose",
            "meeting_location",
            "flexible_dates",
            "cabin",
            "total_budget",
            "passport_expiry",
            "visa_status",
            "visa_expiry",
            "approval_manager_email",
            "flight_preference",
            "preferred_hotel_area",
            "hotel_star_rating",
            "past_hotel_preference",
            "airport_transfer_needed",
            "medical_notes",
            "accessibility_notes",
            "extra_baggage_notes",
        ]
    )
    ws.append(
        [
            "Anika Rao",
            "anika.rao@unipro.com",
            "+91 98765 43210",
            "E-101",
            "manager",
            "India",
            "Hyderabad",
            "Johannesburg",
            "South Africa",
            depart,
            ret,
            "client workshops",
            "Sandton client office",
            "yes",
            "economy",
            1900,
            ret + timedelta(days=220),
            "Valid visa on file",
            ret + timedelta(days=30),
            "manager@unipro.com",
            "short layover",
            "Sandton",
            "4",
            "Garden Court",
            "yes",
            "none",
            "none",
            "one sample kit",
        ]
    )
    policy = wb.create_sheet("Company Policy")
    policy.append(["allowed_cabins", "max_budget"])
    policy.append(["economy,premium_economy", 1950])
    history = wb.create_sheet("Traveller History")
    history.append(["traveler_email", "preferred_airline", "notes"])
    history.append(["anika.rao@unipro.com", "Qatar Airways", "prefers aisle"])
    visa = wb.create_sheet("Visa Rules")
    visa.append(["from_country", "destination_country", "visa_required"])
    visa.append(["India", "South Africa", "yes"])
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def test_manual_create_list_and_detail(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    assert created.status_code == 201
    request_id = created.json()["id"]
    assert created.json()["status"] == "New"
    assert created.json()["owner_id"] == "usr_demo"

    listed = client.get("/api/corporate/requests", headers=_headers(purpose="review corporate requests"))
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [request_id]

    detail = client.get(f"/api/corporate/requests/{request_id}", headers=_headers(purpose="review corporate request detail"))
    assert detail.status_code == 200
    assert detail.json()["travel_details"]["destination"] == "Johannesburg"


def test_excel_import_persists_requests_policy_history_and_visa_rules(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/api/corporate/upload-excel",
        files={"file": ("corporate_travel.xlsx", _workbook_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=_headers(purpose="import corporate travel workbook"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["request_count"] == 1
    assert body["policy_count"] == 1
    assert body["traveller_history_count"] == 1
    assert body["visa_rule_count"] == 1
    assert body["created_request_ids"]
    detail = client.get(
        f"/api/corporate/requests/{body['created_request_ids'][0]}",
        headers=_headers(purpose="review corporate request detail"),
    ).json()
    assert detail["traveller_details"]["phone"] == "+91 98765 43210"
    assert detail["company_details"]["approval_manager_email"] == "manager@unipro.com"
    assert detail["travel_details"]["meeting_location"] == "Sandton client office"
    assert detail["preferences"]["airport_transfer_needed"] is True
    assert detail["budgets"]["extra_baggage_notes"] == "one sample kit"


def test_excel_template_download_contains_request_history_policy_and_visa_sheets(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    response = client.get(
        "/api/corporate/excel-template",
        headers=_headers(purpose="download corporate travel workbook template"),
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    workbook = load_workbook(BytesIO(response.content), data_only=True)
    assert workbook.sheetnames == ["Travel Requests", "Company Policy", "Traveller History", "Visa Rules"]
    assert [cell.value for cell in workbook["Travel Requests"][1]][:6] == [
        "traveler_name",
        "traveler_email",
        "employee_id",
        "department",
        "nationality",
        "origin",
    ]
    assert "preferred_airline" in [cell.value for cell in workbook["Traveller History"][1]]
    request_headers = [cell.value for cell in workbook["Travel Requests"][1]]
    for field in [
        "phone",
        "approval_manager_email",
        "employee_level",
        "meeting_location",
        "flexible_dates",
        "flight_preference",
        "preferred_hotel_area",
        "hotel_star_rating",
        "past_hotel_preference",
        "airport_transfer_needed",
        "medical_notes",
        "accessibility_notes",
        "extra_baggage_notes",
    ]:
        assert field in request_headers


def test_request_update_resolves_missing_information_without_changing_owner(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    payload = _corporate_payload()
    payload["traveller_details"]["traveler_email"] = None
    created = client.post("/api/corporate/requests", json=payload, headers=_headers())
    request_id = created.json()["id"]
    planned = client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers()).json()
    assert "traveller_details.traveler_email" in planned["generated_plan"]["missing_information"]

    planned["traveller_details"]["traveler_email"] = "anika.rao@unipro.com"
    updated = client.put(
        f"/api/corporate/requests/{request_id}",
        json=planned,
        headers=_headers(purpose="resolve missing corporate request information"),
    )

    assert updated.status_code == 200
    assert updated.json()["id"] == request_id
    assert updated.json()["owner_id"] == "usr_demo"
    replanned = client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers()).json()
    assert replanned["generated_plan"]["missing_information"] == []


def test_approval_status_tracking_is_request_data(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(total_budget=1900), headers=_headers())
    request_id = created.json()["id"]

    planned = client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers()).json()
    assert planned["status"] == "Waiting for Approval"
    assert planned["approval_status"] == "Required"

    planned["approval_status"] = "Rejected"
    tracked = client.put(
        f"/api/corporate/requests/{request_id}",
        json=planned,
        headers=_headers(purpose="track corporate approval status"),
    )
    assert tracked.status_code == 200
    assert tracked.json()["approval_status"] == "Rejected"
    assert tracked.json()["status"] == "Waiting for Approval"


def test_finalize_is_blocked_without_generated_plan_and_agent_review(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    request_id = created.json()["id"]

    no_plan = client.post(
        f"/api/corporate/requests/{request_id}/finalize",
        json={"agent_reviewed": True},
        headers=_headers(purpose="finalize approved corporate itinerary"),
    )
    assert no_plan.status_code == 400
    assert no_plan.json()["detail"] == "Final itinerary is not ready"

    client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers())
    no_review = client.post(
        f"/api/corporate/requests/{request_id}/finalize",
        json={"agent_reviewed": False},
        headers=_headers(purpose="finalize approved corporate itinerary"),
    )
    assert no_review.status_code == 400
    assert no_review.json()["detail"] == "Final itinerary is not ready"


def test_finalize_succeeds_when_agent_reviewed_and_approval_received(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(total_budget=1900), headers=_headers())
    request_id = created.json()["id"]
    client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers())

    blocked = client.post(
        f"/api/corporate/requests/{request_id}/finalize",
        json={"agent_reviewed": True},
        headers=_headers(purpose="finalize approved corporate itinerary"),
    )
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Final itinerary is not ready"

    finalized = client.post(
        f"/api/corporate/requests/{request_id}/finalize",
        json={"agent_reviewed": True, "approval_status": "Received"},
        headers=_headers(purpose="finalize approved corporate itinerary"),
    )
    assert finalized.status_code == 200
    assert finalized.json()["status"] == "Finalized"
    assert finalized.json()["approval_status"] == "Received"


def test_final_itinerary_export_is_blocked_until_request_is_finalized(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    request_id = created.json()["id"]

    unplanned_export = client.get(
        f"/api/corporate/requests/{request_id}/export.xlsx",
        headers=_headers(purpose="download finalized corporate itinerary excel"),
    )
    assert unplanned_export.status_code == 400
    assert unplanned_export.json()["detail"] == "Final itinerary is not ready"

    client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers())
    planned_export = client.get(
        f"/api/corporate/requests/{request_id}/export.xlsx",
        headers=_headers(purpose="download finalized corporate itinerary excel"),
    )
    assert planned_export.status_code == 400
    assert planned_export.json()["detail"] == "Final itinerary is not ready"


def test_blocked_finalization_and_export_attempts_are_audited(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    request_id = created.json()["id"]

    finalize = client.post(
        f"/api/corporate/requests/{request_id}/finalize",
        json={"agent_reviewed": True},
        headers=_headers(purpose="finalize approved corporate itinerary"),
    )
    export = client.get(
        f"/api/corporate/requests/{request_id}/export.xlsx",
        headers=_headers(purpose="download finalized corporate itinerary excel"),
    )

    assert finalize.status_code == 400
    assert export.status_code == 400
    audit = client.get(
        "/api/admin/audit",
        headers=_headers("admin.user@unipro.com", "review security audit events"),
    )
    assert audit.status_code == 200
    events = audit.json()
    assert any(event["event_type"] == "corporate.finalize.blocked" and event["decision"] == "deny" for event in events)
    assert any(event["event_type"] == "corporate.request_export.blocked" and event["decision"] == "deny" for event in events)
    assert "anika.rao@unipro.com" not in audit.text


def test_final_itinerary_notification_is_blocked_until_request_is_finalized(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    request_id = created.json()["id"]

    blocked = client.post(
        f"/api/corporate/requests/{request_id}/notifications",
        json={"kind": "final_itinerary", "to": ["traveler@example.com"], "attach_itinerary": True},
        headers=_headers(purpose="send final itinerary notification"),
    )

    assert blocked.status_code == 400
    assert blocked.json()["detail"] == "Final itinerary is not ready"
    audit = client.get(
        "/api/admin/audit",
        headers=_headers("admin.user@unipro.com", "review travel audit events"),
    )
    assert any(event["event_type"] == "corporate.notification.blocked" and event["decision"] == "deny" for event in audit.json())


def test_generate_plan_for_hyderabad_to_johannesburg_checks_documents_budget_and_policy(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    imported = client.post(
        "/api/corporate/upload-excel",
        files={"file": ("corporate_travel.xlsx", _workbook_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=_headers(purpose="import corporate travel workbook"),
    )
    request_id = imported.json()["created_request_ids"][0]

    planned = client.post(
        f"/api/corporate/requests/{request_id}/plan",
        headers=_headers(purpose="generate compliant corporate travel plan"),
    )

    assert planned.status_code == 200
    body = planned.json()
    plan = body["generated_plan"]
    assert body["status"] == "Waiting for Approval"
    assert plan["request_summary"].startswith("Anika Rao needs client workshops travel from Hyderabad to Johannesburg")
    assert plan["missing_information"] == []
    assert plan["travel_readiness"]["passport_status"] == "Ready"
    assert plan["travel_readiness"]["visa_status"] == "Ready"
    assert plan["budget_policy_check"]["budget_status"] == "Needs Approval"
    assert plan["budget_policy_check"]["policy_status"] == "Policy Violation"
    assert plan["budget_policy_check"]["approval_required"] is True
    assert [option["option_name"] for option in plan["travel_options"]] == [
        "Best within budget",
        "Fastest route",
        "Comfort-focused option",
    ]
    assert "Traveller history note" in " ".join(plan["agent_notes"])


def test_generate_plan_uses_openrouter_deepseek_for_structured_ai_draft_when_configured(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("OPENROUTER_FLASH_MODEL", "openrouter/deepseek/deepseek-v4-flash")
    monkeypatch.setenv("OPENROUTER_PROVIDER_ORDER", "DeepSeek")

    import httpx

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            plan = {
                "request_summary": "DeepSeek structured summary for Anika Rao's Johannesburg trip.",
                "missing_information": ["model tried to change this"],
                "travel_readiness": {
                    "passport_status": "Needs Review",
                    "visa_status": "Needs Review",
                    "transit_warning": "Model transit note",
                    "document_notes": ["Model document note"],
                },
                "budget_policy_check": {
                    "budget_status": "Within Budget",
                    "policy_status": "Compliant",
                    "approval_required": False,
                    "approval_reason": "Model tried to change this",
                    "total_budget": 999999,
                    "estimated_cost": 1,
                },
                "travel_options": [
                    {
                        "option_name": "Best within budget",
                        "flight_summary": "DeepSeek low-cost flight wording.",
                        "hotel_summary": "DeepSeek low-cost hotel wording.",
                        "estimated_cost": 1,
                        "pros": ["clear customer wording"],
                        "cons": ["requires agent review"],
                        "policy_status": "Model changed",
                        "recommendation_reason": "DeepSeek recommendation.",
                    },
                    {
                        "option_name": "Fastest route",
                        "flight_summary": "DeepSeek fastest flight wording.",
                        "hotel_summary": "DeepSeek fastest hotel wording.",
                        "estimated_cost": 2,
                        "pros": ["shorter travel day"],
                        "cons": ["higher cost"],
                        "policy_status": "Model changed",
                        "recommendation_reason": "DeepSeek recommendation.",
                    },
                    {
                        "option_name": "Comfort-focused option",
                        "flight_summary": "DeepSeek comfort flight wording.",
                        "hotel_summary": "DeepSeek comfort hotel wording.",
                        "estimated_cost": 3,
                        "pros": ["better rest"],
                        "cons": ["approval likely"],
                        "policy_status": "Model changed",
                        "recommendation_reason": "DeepSeek recommendation.",
                    },
                ],
                "agent_note": "DeepSeek agent note.",
                "agent_notes": ["DeepSeek operational note."],
                "customer_message_draft": "DeepSeek customer message.",
                "customer_itinerary_draft": "DeepSeek itinerary draft.",
                "approval_status": "Plan Generated",
            }
            return {"choices": [{"message": {"content": json.dumps(plan)}}]}

    captured = {}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    created = client.post("/api/corporate/requests", json=_corporate_payload(total_budget=1900), headers=_headers())
    planned = client.post(f"/api/corporate/requests/{created.json()['id']}/plan", headers=_headers())

    assert planned.status_code == 200
    plan = planned.json()["generated_plan"]
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-openrouter-key"
    assert captured["json"]["model"] == "deepseek/deepseek-v4-flash"
    assert captured["json"]["provider"] == {"order": ["DeepSeek"], "allow_fallbacks": False}
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert plan["request_summary"].startswith("DeepSeek structured summary")
    assert plan["budget_policy_check"]["budget_status"] == "Needs Approval"
    assert plan["budget_policy_check"]["approval_required"] is True
    assert plan["travel_options"][0]["estimated_cost"] != 1
    assert "OpenRouter generated the narrative draft" in " ".join(plan["agent_notes"])


def test_traveler_policy_and_resend_notification_contracts(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    request_id = created.json()["id"]

    travelers = client.get("/api/travelers", headers=_headers(purpose="review traveler roster"))
    assert travelers.status_code == 200
    assert travelers.json()[0]["email"] == "anika.rao@unipro.com"
    traveler_detail = client.get(f"/api/travelers/{travelers.json()[0]['id']}", headers=_headers(purpose="review traveler dossier"))
    assert traveler_detail.status_code == 200
    assert traveler_detail.json()["documents"][0]["label"] == "Passport"

    policies = client.get("/api/policies", headers=_headers("admin.user@unipro.com", "review policy center"))
    assert policies.status_code == 200
    policy = policies.json()[0]
    assert policy["id"] == "policy_global_travel_2024"

    versions = client.get(
        f"/api/policies/{policy['id']}/versions",
        headers=_headers("admin.user@unipro.com", "review policy lifecycle"),
    )
    assert versions.status_code == 200
    revision_id = versions.json()[0]["id"]

    approved = client.post(
        f"/api/policies/{policy['id']}/revisions/{revision_id}/approve",
        json={"comment": "Approved for publication."},
        headers=_headers("admin.user@unipro.com", "approve policy revision"),
    )
    assert approved.status_code == 200
    assert approved.json()["revisions"][0]["status"] == "Approved"

    activity = client.get(
        f"/api/policies/{policy['id']}/activity",
        headers=_headers("admin.user@unipro.com", "review policy activity"),
    )
    assert activity.status_code == 200
    assert "approved" in activity.json()[0]["activity"].lower()

    notification = client.post(
        f"/api/corporate/requests/{request_id}/notifications",
        json={"kind": "approval_request", "to": ["manager@unipro.com"], "note": "Please review.", "attach_itinerary": False},
        headers=_headers(purpose="send approval request notification"),
    )
    assert notification.status_code == 200
    assert notification.json()["status"] == "configuration_required"
    assert notification.json()["safe_message"] == "Email provider is not configured. Continue with manual follow-up."


def test_resend_notification_and_webhook_store_safe_events(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    request_id = created.json()["id"]
    client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers())
    finalized = client.post(
        f"/api/corporate/requests/{request_id}/finalize",
        json={"agent_reviewed": True, "approval_status": "Received"},
        headers=_headers(purpose="finalize approved corporate itinerary"),
    )
    assert finalized.status_code == 200
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "Unipro Travel <travel@example.com>")

    import httpx

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"id": "email_123"}

    captured = {}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    sent = client.post(
        f"/api/corporate/requests/{request_id}/notifications",
        json={"kind": "final_itinerary", "to": ["traveler@example.com"], "attach_itinerary": True},
        headers=_headers(purpose="send final itinerary notification"),
    )

    assert sent.status_code == 200
    assert sent.json()["status"] == "sent"
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["headers"]["Authorization"] == "Bearer re_test_key"
    assert captured["headers"]["Idempotency-Key"] == f"travel-ai/{request_id}/final_itinerary"
    assert captured["json"]["attachments"][0]["filename"] == f"{request_id}-final-itinerary.xlsx"

    webhook = client.post(
        "/api/mail/resend/webhook",
        json={
            "type": "email.sent",
            "data": {
                "email_id": "email_123",
                "to": ["traveler@example.com"],
                "subject": "Final itinerary",
                "tags": {"request_id": request_id, "kind": "final_itinerary"},
            },
        },
    )
    assert webhook.status_code == 200
    assert webhook.json()["status"] == "received"
    assert webhook.json()["request_id"] == request_id


def test_resend_webhook_requires_valid_svix_signature_when_secret_is_configured(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    secret_bytes = b"travel-ai-webhook-secret"
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", "whsec_" + base64.b64encode(secret_bytes).decode("ascii"))
    event = {
        "type": "email.sent",
        "data": {
            "email_id": "email_456",
            "to": ["traveler@example.com"],
            "subject": "Approval request",
            "tags": {"request_id": "corp_req_123", "kind": "approval_request"},
        },
    }
    payload = json.dumps(event, separators=(",", ":")).encode("utf-8")

    missing_headers = client.post("/api/mail/resend/webhook", content=payload, headers={"Content-Type": "application/json"})
    assert missing_headers.status_code == 400

    svix_id = "msg_123"
    timestamp = "1716210000"
    signed_payload = f"{svix_id}.{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    signature = base64.b64encode(hmac.new(secret_bytes, signed_payload, hashlib.sha256).digest()).decode("ascii")

    accepted = client.post(
        "/api/mail/resend/webhook",
        content=payload,
        headers={
            "Content-Type": "application/json",
            "svix-id": svix_id,
            "svix-timestamp": timestamp,
            "svix-signature": f"v1,{signature}",
        },
    )

    assert accepted.status_code == 200
    assert accepted.json()["status"] == "received"
    assert accepted.json()["request_id"] == "corp_req_123"


def test_missing_info_and_passport_visa_blocking_detection(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    depart = date.today() + timedelta(days=30)
    ret = depart + timedelta(days=4)
    payload = {
        "traveller_details": {
            "traveler_name": "Anika Rao",
            "nationality": "India",
            "passport_expiry": str(ret - timedelta(days=1)),
        },
        "travel_details": {
            "origin": "Hyderabad",
            "destination": "Johannesburg",
            "destination_country": "South Africa",
            "depart_date": str(depart),
            "return_date": str(ret),
        },
        "budgets": {"total_budget": 3000},
    }
    created = client.post("/api/corporate/requests", json=payload, headers=_headers())
    request_id = created.json()["id"]

    planned = client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers())

    plan = planned.json()["generated_plan"]
    assert planned.json()["status"] == "Missing Info"
    assert "traveller_details.traveler_email" in plan["missing_information"]
    assert plan["travel_readiness"]["passport_status"] == "Blocking Issue"
    assert plan["travel_readiness"]["visa_status"] == "Needs Review"


def test_missing_required_visa_and_expired_visa_are_blocking(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    imported = client.post(
        "/api/corporate/upload-excel",
        files={"file": ("corporate_travel.xlsx", _workbook_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=_headers(purpose="import corporate travel workbook"),
    )
    request_id = imported.json()["created_request_ids"][0]
    detail = client.get(f"/api/corporate/requests/{request_id}", headers=_headers(purpose="review corporate request detail")).json()
    detail["traveller_details"]["visa_status"] = None
    detail["traveller_details"]["visa_expiry"] = None
    updated = client.post("/api/corporate/requests", json=detail, headers=_headers(purpose="create copied corporate request"))
    copied_id = updated.json()["id"]

    planned = client.post(f"/api/corporate/requests/{copied_id}/plan", headers=_headers())

    assert planned.json()["generated_plan"]["travel_readiness"]["visa_status"] == "Blocking Issue"

    detail["traveller_details"]["visa_status"] = "Valid visa on file"
    detail["traveller_details"]["visa_expiry"] = detail["travel_details"]["depart_date"]
    expired = client.post("/api/corporate/requests", json=detail, headers=_headers(purpose="create expired visa corporate request"))
    expired_plan = client.post(f"/api/corporate/requests/{expired.json()['id']}/plan", headers=_headers())

    assert expired_plan.json()["generated_plan"]["travel_readiness"]["visa_status"] == "Blocking Issue"


def test_edit_plan_and_finalize_flow(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/corporate/requests", json=_corporate_payload(), headers=_headers())
    request_id = created.json()["id"]
    planned = client.post(f"/api/corporate/requests/{request_id}/plan", headers=_headers()).json()
    plan = planned["generated_plan"]
    plan["agent_note"] = "Edited by agent before customer send."

    edited = client.put(
        f"/api/corporate/requests/{request_id}/plan",
        json={"generated_plan": plan},
        headers=_headers(purpose="edit generated corporate travel plan"),
    )
    assert edited.status_code == 200
    assert edited.json()["generated_plan"]["agent_note"] == "Edited by agent before customer send."

    finalized = client.post(
        f"/api/corporate/requests/{request_id}/finalize",
        json={"agent_reviewed": True, "approval_status": "Received"},
        headers=_headers(purpose="finalize approved corporate itinerary"),
    )
    assert finalized.status_code == 200
    assert finalized.json()["status"] == "Finalized"

    exported = client.get(
        f"/api/corporate/requests/{request_id}/export.xlsx",
        headers=_headers(purpose="download finalized corporate itinerary excel"),
    )
    assert exported.status_code == 200
    workbook = load_workbook(BytesIO(exported.content), data_only=True)
    assert workbook.sheetnames == ["Request", "Recommended Plans", "Final Itinerary"]
    assert workbook["Request"]["B2"].value == request_id
    assert workbook["Final Itinerary"]["B4"].value == "Edited by agent before customer send."

    summary = client.get(
        "/api/corporate/admin/summary",
        headers=_headers("admin.user@unipro.com", "review corporate travel program summary"),
    )
    assert summary.status_code == 200
    assert summary.json()["finalized"] == 1
    assert summary.json()["common_destinations"] == [{"destination": "Johannesburg", "count": 1}]
