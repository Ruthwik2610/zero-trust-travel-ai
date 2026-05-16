import os

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .agent import plan_trip
from .models import AdminSummary, AuditEvent, PlanResponse, TravelRequest, Trip
from .security import public_error_message
from .store import TravelStore


app = FastAPI(title="Travel AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_auth(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("API_KEY")
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def get_store() -> TravelStore:
    return TravelStore()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/agent/plan", response_model=PlanResponse)
def create_plan(request: TravelRequest, _: None = Depends(require_auth)) -> PlanResponse:
    try:
        return plan_trip(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=public_error_message(exc)) from exc


@app.get("/api/trips", response_model=list[Trip])
def list_trips(_: None = Depends(require_auth), store: TravelStore = Depends(get_store)) -> list[Trip]:
    return store.list_trips()


@app.post("/api/trips", response_model=Trip, status_code=status.HTTP_201_CREATED)
def create_trip(request: TravelRequest, _: None = Depends(require_auth), store: TravelStore = Depends(get_store)) -> Trip:
    response = plan_trip(request)
    events = response.audit_events + [AuditEvent(trip_id=response.trip.id, event_type="trip.created", message="Trip draft saved.")]
    return store.save_trip(response.trip, events)


@app.get("/api/admin/summary", response_model=AdminSummary)
def admin_summary(_: None = Depends(require_auth), store: TravelStore = Depends(get_store)) -> AdminSummary:
    return store.admin_summary()


@app.get("/api/admin/audit", response_model=list[AuditEvent])
def admin_audit(_: None = Depends(require_auth), store: TravelStore = Depends(get_store)) -> list[AuditEvent]:
    return store.list_audit_events()

