from datetime import date, timedelta
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_PATH = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

from app.main import app, cors_allowed_origins
from app.security import create_access_token


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_DB_PATH", str(tmp_path / "travel_ai.db"))
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    for name in ("DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "DUFFEL_API_TOKEN", "BOOKING_COM_TOKEN", "BOOKING_COM_AFFILIATE_ID", "RAPIDAPI_BOOKING_KEY"):
        monkeypatch.delenv(name, raising=False)
    return TestClient(app)


def _headers(email="demo.user@unipro.com", purpose="plan compliant business travel"):
    token, _ = create_access_token(email)
    return {"Authorization": f"Bearer {token}", "X-Travel-Purpose": purpose}


def _request_payload():
    return {
        "origin": "SFO",
        "destination": "New York",
        "depart_date": str(date.today() + timedelta(days=21)),
        "return_date": str(date.today() + timedelta(days=25)),
        "travelers": 2,
        "cabin": "economy",
        "budget_usd": 2400,
        "purpose": "client meetings",
    }


def test_cors_origins_are_env_driven(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://travel.example.com, http://127.0.0.1:3100 ")

    assert cors_allowed_origins() == ["https://travel.example.com", "http://127.0.0.1:3100"]


def test_production_requires_explicit_token_secret(monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_ENV", "production")
    monkeypatch.delenv("TRAVEL_AI_TOKEN_SECRET", raising=False)
    monkeypatch.setenv("API_KEY", "legacy-fallback-must-not-sign-production-tokens")

    try:
        create_access_token("demo.user@unipro.com")
    except RuntimeError as exc:
        assert "TRAVEL_AI_TOKEN_SECRET is required in production" in str(exc)
    else:
        raise AssertionError("production token creation should fail without TRAVEL_AI_TOKEN_SECRET")


def test_plan_response_is_polished_and_records_provider_unavailable(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    response = client.post("/api/agent/plan", json=_request_payload(), headers=_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["risk"] == "low"
    assert body["trip"]["status"] == "draft"
    assert body["trip"]["owner_id"] == "usr_demo"
    assert body["trip"]["request"]["origin"] == "SFO"
    assert body["trip"]["flight_offers"][0]["provider"] == "manual-sourcing-required"
    assert body["trip"]["flight_offers"][0]["price_usd"] == 0
    assert "manual sourcing" in " ".join(body["trip"]["flight_offers"][0]["notes"]).lower()
    assert [leg["direction"] for leg in body["trip"]["flight_offers"][0]["flight_legs"]] == ["outbound", "return"]
    assert body["trip"]["hotel_offers"][0]["provider"] == "manual-sourcing-required"
    assert body["trip"]["hotel_offers"][0]["price_usd"] == 0
    assert body["trip"]["itinerary"][0]["title"]
    assert "live booking inventory" not in body["user_message"].lower()
    assert body["audit_events"]
    assert any(event["event_type"] == "mcp.live_search.unavailable" for event in body["audit_events"])


def test_plan_response_uses_duffel_and_booking_mcp_tools(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("TRAVEL_AI_MCP_TOOLS_URL", "http://mcp.local/tools")

    import httpx

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    calls = []

    def fake_post(url, json, timeout):
        calls.append((url, json))
        if url.endswith("/search_flights"):
            text = """
            [{
              "airline": "Qatar Airways",
              "airline_iata": "QR",
              "origin": "SFO",
              "destination": "JFK",
              "departure_at": "2026-06-10T08:00:00",
              "arrival_at": "2026-06-10T16:00:00",
              "return_departure_at": "2026-06-14T09:00:00",
              "return_arrival_at": "2026-06-14T17:00:00",
              "stops": 1,
              "cabin_class": "economy",
              "price_usd": 512,
              "currency": "USD",
              "booking_redirect_url": "https://app.duffel.com/search"
            }]
            """
        elif url.endswith("/search_hotels"):
            text = """
            [{
              "hotel_id": "booking_123",
              "name": "Booking Live Hotel",
              "address": "Midtown",
              "star_rating": 4,
              "review_score": 8.7,
              "price_per_night": 120,
              "total_price": 480,
              "currency": "USD",
              "redirect_url": "https://booking.com/hotel"
            }]
            """
        else:
            text = "[]"
        return FakeResponse({"content": [{"type": "text", "text": text}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post("/api/agent/plan", json=_request_payload(), headers=_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["trip"]["flight_offers"][0]["provider"] == "duffel-mcp/qr"
    assert body["trip"]["flight_offers"][0]["flight_legs"][0]["direction"] == "outbound"
    assert body["trip"]["flight_offers"][0]["flight_legs"][1]["direction"] == "return"
    assert body["trip"]["flight_offers"][0]["flight_legs"][1]["departure_at"] == "2026-06-14T09:00:00"
    assert body["trip"]["hotel_offers"][0]["provider"] == "booking.com-mcp"
    assert body["trip"]["hotel_offers"][0]["title"] == "Booking Live Hotel"
    assert any(event["event_type"] == "mcp.duffel.search" for event in body["audit_events"])
    assert any(event["event_type"] == "mcp.booking.search" for event in body["audit_events"])
    assert [call[0] for call in calls] == ["http://mcp.local/tools/search_flights", "http://mcp.local/tools/search_hotels"]
    assert calls[0][1]["return_date"] == _request_payload()["return_date"]


def test_plan_response_prefers_direct_duffel_api_when_configured(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("DUFFEL_API_TOKEN", "test-duffel-token")
    monkeypatch.setenv("TRAVEL_AI_MCP_TOOLS_URL", "http://mcp.local/tools")

    import httpx

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    calls = []

    def fake_post(url, *args, **kwargs):
        calls.append((url, kwargs))
        if url == "https://api.duffel.com/air/offer_requests":
            return FakeResponse(
                {
                    "data": {
                        "offers": [
                            {
                                "id": "off_live",
                                "total_amount": "612",
                                "total_currency": "USD",
                                "owner": {"name": "Qatar Airways", "iata_code": "QR"},
                                "slices": [
                                    {
                                        "segments": [
                                            {
                                                "departing_at": "2026-06-10T08:00:00",
                                                "arriving_at": "2026-06-10T16:00:00",
                                                "origin": {"iata_code": "SFO"},
                                                "destination": {"iata_code": "JFK"},
                                                "marketing_carrier": {"name": "Qatar Airways"},
                                            }
                                        ]
                                    },
                                    {
                                        "segments": [
                                            {
                                                "departing_at": "2026-06-14T09:00:00",
                                                "arriving_at": "2026-06-14T17:00:00",
                                                "origin": {"iata_code": "JFK"},
                                                "destination": {"iata_code": "SFO"},
                                                "marketing_carrier": {"name": "Qatar Airways"},
                                            }
                                        ]
                                    },
                                ],
                            }
                        ]
                    }
                }
            )
        return FakeResponse({"content": [{"type": "text", "text": "[]"}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post("/api/agent/plan", json=_request_payload(), headers=_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["trip"]["flight_offers"][0]["provider"] == "duffel-api/qr"
    assert body["trip"]["flight_offers"][0]["price_usd"] == 612
    assert any(event["event_type"] == "duffel.api.search" for event in body["audit_events"])
    assert calls[0][1]["headers"]["Authorization"] == "Bearer test-duffel-token"
    assert calls[0][1]["headers"]["Duffel-Version"] == "v2"
    assert calls[0][1]["headers"]["Accept-Encoding"] == "gzip"
    assert calls[0][1]["params"] == {"return_offers": True, "supplier_timeout": 10000}
    assert calls[0][1]["json"]["data"]["slices"] == [
        {"origin": "SFO", "destination": "JFK", "departure_date": _request_payload()["depart_date"]},
        {"origin": "JFK", "destination": "SFO", "departure_date": _request_payload()["return_date"]},
    ]
    assert calls[0][1]["json"]["data"]["passengers"] == [{"type": "adult"}, {"type": "adult"}]
    assert calls[0][1]["json"]["data"]["cabin_class"] == "economy"
    assert not any("/orders" in call[0] for call in calls)

    audit = client.get("/api/admin/audit", headers=_headers("admin.user@unipro.com", "review security audit events"))
    assert audit.status_code == 200
    assert any(event["event_type"] == "duffel.api.search" for event in audit.json())
    assert "test-duffel-token" not in audit.text


def test_plan_response_uses_booking_demand_api_when_configured(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("BOOKING_COM_TOKEN", "test-booking-token")
    monkeypatch.setenv("BOOKING_COM_AFFILIATE_ID", "12345")
    monkeypatch.setenv("BOOKING_COM_CITY_IDS", json.dumps({"New York": -2140479}))
    monkeypatch.setenv("TRAVEL_AI_MCP_TOOLS_URL", "http://mcp.local/tools")

    import httpx

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    calls = []

    def fake_post(url, *args, **kwargs):
        calls.append((url, kwargs))
        if url == "https://demandapi.booking.com/3.1/accommodations/search":
            return FakeResponse(
                {
                    "data": [
                        {
                            "id": 10004,
                            "name": "Booking Demand Hotel",
                            "currency": "USD",
                            "price": {"book": "480"},
                            "products": [{"policies": {"cancellation": {"free_cancellation_until": "2026-06-01"}}}],
                        }
                    ]
                }
            )
        return FakeResponse({"content": [{"type": "text", "text": "[]"}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post("/api/agent/plan", json=_request_payload(), headers=_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["trip"]["hotel_offers"][0]["provider"] == "booking.com-demand-api"
    assert body["trip"]["hotel_offers"][0]["title"] == "Booking Demand Hotel"
    assert body["trip"]["hotel_offers"][0]["price_usd"] == 480
    assert any(event["event_type"] == "booking.api.search" for event in body["audit_events"])
    booking_call = next(call for call in calls if call[0].endswith("/accommodations/search"))
    assert booking_call[1]["headers"]["X-Affiliate-Id"] == "12345"
    assert booking_call[1]["json"]["city"] == -2140479


def test_plan_response_uses_booking_rapidapi_when_configured(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("RAPIDAPI_BOOKING_KEY", "rapid-booking-key")
    monkeypatch.setenv("TRAVEL_AI_MCP_TOOLS_URL", "http://mcp.local/tools")

    import httpx

    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    calls = []

    def fake_get(url, params, headers, timeout):
        calls.append((url, params, headers))
        if url.endswith("/locations"):
            return FakeResponse([{"dest_type": "city", "dest_id": "-20088325", "name": "New York"}])
        return FakeResponse(
            {
                "result": [
                    {
                        "hotel_id": 1682114,
                        "hotel_name": "RapidAPI Booking Hotel",
                        "min_total_price": 520,
                        "currency_code": "USD",
                        "url": "https://www.booking.com/hotel/us/example.html",
                        "review_score": 8.7,
                    }
                ]
            }
        )

    def fake_post(url, *args, **kwargs):
        return FakeResponse({"content": [{"type": "text", "text": "[]"}]})

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post("/api/agent/plan", json=_request_payload(), headers=_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["trip"]["hotel_offers"][0]["provider"] == "booking.com-rapidapi"
    assert body["trip"]["hotel_offers"][0]["title"] == "RapidAPI Booking Hotel"
    assert any(event["event_type"] == "booking.rapidapi.search" for event in body["audit_events"])
    assert calls[0][2]["x-rapidapi-key"] == "rapid-booking-key"
    assert calls[1][1]["dest_id"] == "-20088325"


def test_currency_conversion_uses_mcp_tool(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("TRAVEL_AI_MCP_TOOLS_URL", "http://mcp.local/tools")

    import httpx

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"content": [{"type": "text", "text": "{\"converted_amount\": 153846, \"rate\": 83.16}"}]}

    calls = []

    def fake_post(url, json, timeout):
        calls.append((url, json, timeout))
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/tools/currency-conversion",
        json={"amount_usd": 1850, "to_currency": "INR"},
        headers=_headers(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["currency"] == "INR"
    assert body["amount"] == 153846
    assert body["source"] == "mcp"
    assert calls == [("http://mcp.local/tools/convert_currency", {"amount": 1850, "from_currency": "USD", "to_currency": "INR"}, 8)]


def test_trip_persistence_and_admin_summary(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    payload = _request_payload()

    created = client.post("/api/trips", json=payload, headers=_headers())
    assert created.status_code == 201
    trip = created.json()

    listed = client.get("/api/trips", headers=_headers(purpose="review own saved trips"))
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == trip["id"]

    summary = client.get("/api/admin/summary", headers=_headers("admin.user@unipro.com", "review aggregate travel budget and policy posture"))
    assert summary.status_code == 200
    assert summary.json()["total_trips"] == 1
    assert summary.json()["draft_trips"] == 1
    assert summary.json()["audit_events"] == 0
    assert summary.json()["budget_by_traveler"][0]["traveler_ref"].startswith("traveler-")
    assert "usr_demo" not in summary.text
    assert "demo.user@unipro.com" not in summary.text

    audit = client.get("/api/admin/audit", headers=_headers("admin.user@unipro.com", "review security audit events"))
    assert audit.status_code == 200
    audit_events = audit.json()
    assert any(event["event_type"] == "admin.audit.allowed" for event in audit_events)
    assert "usr_demo" not in audit.text
    assert "demo.user@unipro.com" not in audit.text


def test_backend_denies_missing_token_and_missing_purpose(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    assert client.get("/api/trips").status_code == 401
    assert client.get("/api/trips", headers={"Authorization": _headers()["Authorization"]}).status_code == 403


def test_travelers_can_only_read_their_own_trip_rows(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    first_payload = _request_payload()
    second_payload = {**_request_payload(), "destination": "Tokyo, Japan"}

    first = client.post("/api/trips", json=first_payload, headers=_headers("demo.user@unipro.com"))
    second = client.post("/api/trips", json=second_payload, headers=_headers("client.lead@unipro.com"))

    assert first.status_code == 201
    assert second.status_code == 201
    demo_rows = client.get("/api/trips", headers=_headers("demo.user@unipro.com", "review own saved trips")).json()
    client_rows = client.get("/api/trips", headers=_headers("client.lead@unipro.com", "review own saved trips")).json()

    assert [row["id"] for row in demo_rows] == [first.json()["id"]]
    assert [row["id"] for row in client_rows] == [second.json()["id"]]


def test_traveler_token_cannot_read_admin_summary(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    response = client.get("/api/admin/summary", headers=_headers("demo.user@unipro.com", "review aggregate travel budget and policy posture"))

    assert response.status_code == 403


def test_chat_endpoint_uses_openrouter_and_records_audit(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("MODEL", "openrouter/deepseek/deepseek-v4-flash")

    import httpx

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "You should confirm visa readiness and keep this trip within policy."}}]}

    captured = {}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/agent/chat",
        json={"message": "Do I need a visa?", "history": []},
        headers=_headers(purpose="chat with travel assistant for compliant business travel"),
    )

    assert response.status_code == 200
    body = response.json()
    assert "visa readiness" in body["message"]
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-openrouter-key"
    assert captured["json"]["model"] == "deepseek/deepseek-v4-flash"
    assert captured["json"]["provider"] == {"order": ["DeepSeek"], "allow_fallbacks": False}
    assert captured["json"]["stream"] is False

    audit = client.get("/api/admin/audit", headers=_headers("admin.user@unipro.com", "review security audit events"))
    assert audit.status_code == 200
    audit_events = audit.json()
    assert any(event["event_type"] == "agent.chat.allowed" for event in audit_events)
    assert any(event["event_type"] == "agent.chat.completed" for event in audit_events)
    assert "test-openrouter-key" not in audit.text


def test_chat_endpoint_prefers_deepseek_when_configured(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")

    import httpx

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "DeepSeek says keep the itinerary under agent review."}}]}

    captured = {}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/agent/chat",
        json={"message": "Create a cheaper option", "history": []},
        headers=_headers(purpose="chat with travel assistant for compliant business travel"),
    )

    assert response.status_code == 200
    assert response.json()["model"] == "deepseek-v4-flash"
    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-deepseek-key"
