from datetime import date, timedelta
import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_PATH = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

from app.main import app


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_DB_PATH", str(tmp_path / "travel_ai.db"))
    monkeypatch.delenv("API_KEY", raising=False)
    return TestClient(app)


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


def test_plan_response_is_polished_and_does_not_claim_live_inventory(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    response = client.post("/api/agent/plan", json=_request_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["risk"] == "low"
    assert body["trip"]["status"] == "draft"
    assert body["trip"]["request"]["origin"] == "SFO"
    assert body["trip"]["flight_offers"][0]["provider"] == "deterministic-planner"
    assert body["trip"]["hotel_offers"][0]["price_usd"] > 0
    assert body["trip"]["itinerary"][0]["title"]
    assert "live booking inventory" not in body["user_message"].lower()
    assert body["audit_events"]


def test_trip_persistence_and_admin_summary(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    payload = _request_payload()

    created = client.post("/api/trips", json=payload)
    assert created.status_code == 201
    trip = created.json()

    listed = client.get("/api/trips")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == trip["id"]

    summary = client.get("/api/admin/summary")
    assert summary.status_code == 200
    assert summary.json()["total_trips"] == 1
    assert summary.json()["draft_trips"] == 1

    audit = client.get("/api/admin/audit")
    assert audit.status_code == 200
    assert audit.json()[0]["event_type"] == "trip.created"

