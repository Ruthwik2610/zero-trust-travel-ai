import base64
import hashlib
import hmac
import os
from datetime import date, datetime, timezone
from io import BytesIO
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .agent import chat_with_travel_ai, generate_corporate_plan, plan_trip
from .currency import convert_from_usd
from .mailer import send_resend_notification
from .models import (
    AdminSummary,
    AuditEvent,
    AuthContext,
    AuthTokenRequest,
    AuthTokenResponse,
    ChatRequest,
    ChatResponse,
    CompanyDetails,
    CorporateAdminSummary,
    CorporateFinalizeRequest,
    CorporateImportResponse,
    CorporatePlanUpdate,
    CorporateRequestStatusUpdate,
    CorporateTravelRequest,
    CurrencyConversionRequest,
    CurrencyConversionResponse,
    EmailEvent,
    NotificationRequest,
    PolicyActivityEvent,
    PolicyGroup,
    PolicyRevision,
    PlanResponse,
    ResendWebhookEvent,
    RevisionActionRequest,
    TravelBudget,
    TravelDetails,
    TravelPreferences,
    TravelerProfile,
    TravellerDetails,
    TravelRequest,
    Trip,
)
from .security import (
    SecurityError,
    authorize_traveler_agent_chain,
    create_access_token,
    ensure_any_scope,
    ensure_scope,
    public_error_message,
    require_purpose,
    verify_access_token,
)
from .store import TravelStore


def cors_allowed_origins() -> list[str]:
    raw = os.getenv("FRONTEND_ORIGIN") or os.getenv("TRAVEL_AI_ALLOWED_ORIGINS") or "http://127.0.0.1:3100,http://localhost:3100"
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="Travel AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_auth(authorization: str | None = Header(default=None)) -> AuthContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    try:
        return verify_access_token(authorization.removeprefix("Bearer ").strip())
    except SecurityError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized") from exc


def get_store() -> TravelStore:
    return TravelStore()


def audit_security_decision(
    store: TravelStore,
    context: AuthContext | None,
    event_type: str,
    message: str,
    purpose: str | None,
    decision: str,
    trip_id: str | None = None,
) -> None:
    store.save_audit_event(
        AuditEvent(
            trip_id=trip_id,
            actor_id=context.user_id if context else None,
            event_type=event_type,
            message=message,
            purpose=purpose,
            decision=decision,  # type: ignore[arg-type]
        )
    )


def protected_purpose(purpose: str | None, store: TravelStore, context: AuthContext, event_type: str) -> str:
    try:
        return require_purpose(purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, event_type, str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/demo-login", response_model=AuthTokenResponse)
def demo_login(request: AuthTokenRequest) -> AuthTokenResponse:
    token, context = create_access_token(request.email)
    return AuthTokenResponse(access_token=token, expires_at=context.token_expires_at, user=context)


@app.post("/api/agent/plan", response_model=PlanResponse)
def create_plan(
    request: TravelRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> PlanResponse:
    purpose = protected_purpose(x_travel_purpose, store, context, "agent.plan.denied")
    try:
        authorize_traveler_agent_chain(context, purpose)
        response = plan_trip(request, owner_id=context.user_id, owner_department=context.department)
        for event in response.audit_events:
            event.trip_id = event.trip_id or response.trip.id
            event.actor_id = context.user_id
            event.purpose = purpose
            event.decision = "allow"
            store.save_audit_event(event)
        audit_security_decision(store, context, "agent.plan.allowed", "Traveler planning agent chain authorized.", purpose, "allow", response.trip.id)
        return response
    except SecurityError as exc:
        audit_security_decision(store, context, "agent.plan.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=public_error_message(exc)) from exc


@app.post("/api/agent/chat", response_model=ChatResponse)
def chat_with_agent(
    request: ChatRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> ChatResponse:
    purpose = protected_purpose(x_travel_purpose, store, context, "agent.chat.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
        response = chat_with_travel_ai(request, context, purpose)
        for event in response.audit_events:
            store.save_audit_event(event)
        audit_security_decision(store, context, "agent.chat.allowed", "Traveler assistant chat completed.", purpose, "allow", request.trip.id if request.trip else None)
        return response
    except SecurityError as exc:
        audit_security_decision(store, context, "agent.chat.denied", str(exc), purpose, "deny", request.trip.id if request.trip else None)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    except Exception as exc:
        audit_security_decision(store, context, "agent.chat.failed", public_error_message(exc), purpose, "deny", request.trip.id if request.trip else None)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Travel assistant is unavailable") from exc


@app.post("/api/tools/currency-conversion", response_model=CurrencyConversionResponse)
def convert_currency(
    request: CurrencyConversionRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CurrencyConversionResponse:
    purpose = protected_purpose(x_travel_purpose, store, context, "tools.currency.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "tools.currency.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    converted = convert_from_usd(request.amount_usd, request.to_currency)
    audit_security_decision(store, context, "tools.currency.converted", "Currency conversion completed for travel estimate.", purpose, "allow")
    return converted


@app.get("/api/trips", response_model=list[Trip])
def list_trips(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> list[Trip]:
    purpose = protected_purpose(x_travel_purpose, store, context, "trips.list.denied")
    try:
        ensure_scope(context, "self:trips", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "trips.list.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    audit_security_decision(store, context, "trips.list.allowed", "Traveler scoped trip history read.", purpose, "allow")
    return store.list_trips_for_owner(context.user_id)


@app.post("/api/trips", response_model=Trip, status_code=status.HTTP_201_CREATED)
def create_trip(
    request: TravelRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> Trip:
    purpose = protected_purpose(x_travel_purpose, store, context, "trip.create.denied")
    try:
        authorize_traveler_agent_chain(context, purpose)
        response = plan_trip(request, owner_id=context.user_id, owner_department=context.department)
    except SecurityError as exc:
        audit_security_decision(store, context, "trip.create.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    events = [
        *response.audit_events,
        AuditEvent(
            trip_id=response.trip.id,
            actor_id=context.user_id,
            event_type="trip.created",
            message="Trip draft saved.",
            purpose=purpose,
            decision="allow",
        ),
    ]
    saved = store.save_trip(response.trip, events)
    audit_security_decision(store, context, "trip.create.allowed", "Traveler scoped trip draft saved.", purpose, "allow", saved.id)
    return saved


@app.get("/api/admin/summary", response_model=AdminSummary)
def admin_summary(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> AdminSummary:
    purpose = protected_purpose(x_travel_purpose, store, context, "admin.summary.denied")
    try:
        ensure_scope(context, "admin:summary", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "admin.summary.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    audit_security_decision(store, context, "admin.summary.allowed", "Aggregate travel program summary read.", purpose, "allow")
    return store.admin_summary()


@app.get("/api/admin/audit", response_model=list[AuditEvent])
def admin_audit(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> list[AuditEvent]:
    purpose = protected_purpose(x_travel_purpose, store, context, "admin.audit.denied")
    try:
        ensure_scope(context, "admin:audit", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "admin.audit.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    audit_security_decision(store, context, "admin.audit.allowed", "Security audit log read.", purpose, "allow")
    return [event.model_copy(update={"actor_id": None}) for event in store.list_audit_events()]


@app.get("/api/corporate/requests", response_model=list[CorporateTravelRequest])
def list_corporate_requests(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> list[CorporateTravelRequest]:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.requests.list.denied")
    try:
        ensure_any_scope(context, {"self:trips", "admin:summary"}, purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.requests.list.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    audit_security_decision(store, context, "corporate.requests.list.allowed", "Corporate requests read.", purpose, "allow")
    if "admin:summary" in context.scopes:
        return store.list_corporate_requests()
    return store.list_corporate_requests_for_owner(context.user_id)


@app.post("/api/corporate/requests", response_model=CorporateTravelRequest, status_code=status.HTTP_201_CREATED)
def create_corporate_request(
    request: CorporateTravelRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateTravelRequest:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.request.create.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.request.create.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    now = datetime.now(timezone.utc)
    saved = request.model_copy(
        update={
            "id": f"corp_req_{uuid4().hex[:12]}",
            "owner_id": context.user_id,
            "owner_department": context.department,
            "created_at": request.created_at or now,
            "updated_at": now,
        }
    )
    saved = store.save_corporate_request(saved)
    audit_security_decision(store, context, "corporate.request.create.allowed", "Corporate request created.", purpose, "allow", saved.id)
    return saved


@app.get("/api/corporate/requests/{request_id}", response_model=CorporateTravelRequest)
def get_corporate_request(
    request_id: str,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateTravelRequest:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.request.read.denied")
    request = _load_authorized_corporate_request(store, context, request_id, purpose)
    audit_security_decision(store, context, "corporate.request.read.allowed", "Corporate request detail read.", purpose, "allow", request.id)
    return request


@app.put("/api/corporate/requests/{request_id}", response_model=CorporateTravelRequest)
def update_corporate_request(
    request_id: str,
    request_update: CorporateTravelRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateTravelRequest:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.request.update.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.request.update.denied", str(exc), purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    existing = _load_authorized_corporate_request(store, context, request_id, purpose)
    updated = request_update.model_copy(
        update={
            "id": existing.id,
            "owner_id": existing.owner_id,
            "owner_department": existing.owner_department,
            "created_at": existing.created_at,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    saved = store.save_corporate_request(updated)
    audit_security_decision(store, context, "corporate.request.update.allowed", "Corporate request updated.", purpose, "allow", saved.id)
    return saved


@app.post("/api/corporate/requests/{request_id}/plan", response_model=CorporateTravelRequest)
def generate_corporate_request_plan(
    request_id: str,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateTravelRequest:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.plan.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.plan.denied", str(exc), purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    request = _load_authorized_corporate_request(store, context, request_id, purpose)
    plan = generate_corporate_plan(
        request,
        policy_rows=store.list_reference_rows("company_policy"),
        traveller_history_rows=store.list_reference_rows("traveller_history"),
        visa_rule_rows=store.list_reference_rows("visa_rules"),
    )
    approval_status = "Required" if plan.budget_policy_check.approval_required else "Not Required"
    updated = request.model_copy(
        update={
            "generated_plan": plan,
            "status": plan.approval_status,
            "approval_status": approval_status,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    saved = store.save_corporate_request(updated)
    audit_security_decision(store, context, "corporate.plan.allowed", "Corporate travel plan generated.", purpose, "allow", saved.id)
    return saved


@app.put("/api/corporate/requests/{request_id}/plan", response_model=CorporateTravelRequest)
def update_corporate_request_plan(
    request_id: str,
    request_update: CorporatePlanUpdate,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateTravelRequest:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.plan.update.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.plan.update.denied", str(exc), purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    existing = _load_authorized_corporate_request(store, context, request_id, purpose)
    updated = existing.model_copy(
        update={
            "generated_plan": request_update.generated_plan,
            "status": request_update.generated_plan.approval_status,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    saved = store.save_corporate_request(updated)
    audit_security_decision(store, context, "corporate.plan.update.allowed", "Corporate travel plan edited.", purpose, "allow", saved.id)
    return saved


@app.post("/api/corporate/requests/{request_id}/status", response_model=CorporateTravelRequest)
def update_corporate_request_status(
    request_id: str,
    status_update: CorporateRequestStatusUpdate,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateTravelRequest:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.status.denied")
    try:
        ensure_any_scope(context, {"travel:plan", "approval:read"}, purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.status.denied", str(exc), purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    existing = _load_authorized_corporate_request(store, context, request_id, purpose)
    updated = existing.model_copy(update={"status": status_update.status, "updated_at": datetime.now(timezone.utc)})
    saved = store.save_corporate_request(updated)
    audit_security_decision(store, context, "corporate.status.allowed", "Corporate request status updated.", purpose, "allow", saved.id)
    return saved


@app.post("/api/corporate/requests/{request_id}/finalize", response_model=CorporateTravelRequest)
def finalize_corporate_request(
    request_id: str,
    finalize_request: CorporateFinalizeRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateTravelRequest:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.finalize.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.finalize.denied", str(exc), purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    existing = _load_authorized_corporate_request(store, context, request_id, purpose)
    approval_status = finalize_request.approval_status or existing.approval_status
    approval_required = bool(existing.generated_plan and existing.generated_plan.budget_policy_check.approval_required)
    if (
        not existing.generated_plan
        or not finalize_request.agent_reviewed
        or existing.status == "Cancelled"
        or (approval_required and approval_status != "Received")
    ):
        audit_security_decision(store, context, "corporate.finalize.blocked", "Final itinerary is not ready.", purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Final itinerary is not ready")
    updated = existing.model_copy(
        update={
            "status": "Finalized",
            "approval_status": approval_status,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    saved = store.save_corporate_request(updated)
    audit_security_decision(store, context, "corporate.finalize.allowed", "Corporate final itinerary generated.", purpose, "allow", saved.id)
    return saved


@app.get("/api/corporate/requests/{request_id}/export.xlsx")
def download_corporate_request_excel(
    request_id: str,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> StreamingResponse:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.request_export.denied")
    request = _load_authorized_corporate_request(store, context, request_id, purpose)
    if request.status != "Finalized" or not request.generated_plan:
        audit_security_decision(store, context, "corporate.request_export.blocked", "Final itinerary is not ready.", purpose, "deny", request.id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Final itinerary is not ready")
    audit_security_decision(store, context, "corporate.request_export.allowed", "Corporate request Excel export generated.", purpose, "allow", request.id)
    return StreamingResponse(
        BytesIO(_corporate_request_workbook_bytes(request)),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{request.id}-final-itinerary.xlsx"'},
    )


@app.get("/api/corporate/excel-template")
def download_corporate_excel_template(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> StreamingResponse:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.excel_template.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.excel_template.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc

    audit_security_decision(store, context, "corporate.excel_template.allowed", "Corporate Excel workbook template generated.", purpose, "allow")
    return StreamingResponse(
        BytesIO(_corporate_template_workbook_bytes()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="corporate_travel_requests_template.xlsx"'},
    )


@app.post("/api/corporate/upload-excel", response_model=CorporateImportResponse)
@app.post("/api/corporate/requests/upload-excel", response_model=CorporateImportResponse)
async def upload_corporate_excel(
    file: UploadFile = File(...),
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateImportResponse:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.excel.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.excel.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    try:
        from openpyxl import load_workbook

        content = await file.read()
        workbook = load_workbook(BytesIO(content), data_only=True)
        request_rows = _sheet_rows(workbook, "Travel Requests")
        policy_rows = _sheet_rows(workbook, "Company Policy")
        history_rows = _sheet_rows(workbook, "Traveller History")
        visa_rows = _sheet_rows(workbook, "Visa Rules")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workbook") from exc

    created_ids: list[str] = []
    now = datetime.now(timezone.utc)
    for row in request_rows:
        corporate_request = _corporate_request_from_row(row, context, now)
        store.save_corporate_request(corporate_request)
        created_ids.append(corporate_request.id)
    policy_count = store.save_reference_rows("company_policy", policy_rows)
    history_count = store.save_reference_rows("traveller_history", history_rows)
    visa_count = store.save_reference_rows("visa_rules", visa_rows)
    audit_security_decision(store, context, "corporate.excel.allowed", "Corporate Excel workbook imported.", purpose, "allow")
    return CorporateImportResponse(
        request_count=len(created_ids),
        policy_count=policy_count,
        traveller_history_count=history_count,
        visa_rule_count=visa_count,
        created_request_ids=created_ids,
    )


@app.get("/api/corporate/admin/summary", response_model=CorporateAdminSummary)
def corporate_admin_summary(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> CorporateAdminSummary:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.admin.summary.denied")
    try:
        ensure_scope(context, "admin:summary", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.admin.summary.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    audit_security_decision(store, context, "corporate.admin.summary.allowed", "Corporate aggregate summary read.", purpose, "allow")
    return store.corporate_admin_summary()


@app.get("/api/travelers", response_model=list[TravelerProfile])
def list_travelers(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> list[TravelerProfile]:
    purpose = protected_purpose(x_travel_purpose, store, context, "travelers.list.denied")
    try:
        ensure_any_scope(context, {"travel:plan", "admin:summary"}, purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "travelers.list.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    audit_security_decision(store, context, "travelers.list.allowed", "Traveler roster read.", purpose, "allow")
    return store.list_travelers()


@app.get("/api/travelers/{traveler_id}", response_model=TravelerProfile)
def get_traveler(
    traveler_id: str,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> TravelerProfile:
    purpose = protected_purpose(x_travel_purpose, store, context, "travelers.read.denied")
    try:
        ensure_any_scope(context, {"travel:plan", "admin:summary"}, purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "travelers.read.denied", str(exc), purpose, "deny", traveler_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    traveler = store.get_traveler(traveler_id)
    if traveler is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    audit_security_decision(store, context, "travelers.read.allowed", "Traveler dossier read.", purpose, "allow", traveler.id)
    return traveler


@app.get("/api/policies", response_model=list[PolicyGroup])
def list_policies(
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> list[PolicyGroup]:
    purpose = protected_purpose(x_travel_purpose, store, context, "policies.list.denied")
    try:
        ensure_any_scope(context, {"policy:read", "admin:summary"}, purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "policies.list.denied", str(exc), purpose, "deny")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    audit_security_decision(store, context, "policies.list.allowed", "Policy groups read.", purpose, "allow")
    return store.list_policy_groups()


@app.get("/api/policies/{policy_id}", response_model=PolicyGroup)
def get_policy(
    policy_id: str,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> PolicyGroup:
    purpose = protected_purpose(x_travel_purpose, store, context, "policies.read.denied")
    policy = _load_policy_group(store, context, policy_id, purpose)
    audit_security_decision(store, context, "policies.read.allowed", "Policy group read.", purpose, "allow", policy.id)
    return policy


@app.get("/api/policies/{policy_id}/versions", response_model=list[PolicyRevision])
def list_policy_versions(
    policy_id: str,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> list[PolicyRevision]:
    purpose = protected_purpose(x_travel_purpose, store, context, "policies.versions.denied")
    policy = _load_policy_group(store, context, policy_id, purpose)
    audit_security_decision(store, context, "policies.versions.allowed", "Policy revisions read.", purpose, "allow", policy.id)
    return policy.revisions


@app.get("/api/policies/{policy_id}/activity", response_model=list[PolicyActivityEvent])
def list_policy_activity(
    policy_id: str,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> list[PolicyActivityEvent]:
    purpose = protected_purpose(x_travel_purpose, store, context, "policies.activity.denied")
    _load_policy_group(store, context, policy_id, purpose)
    audit_security_decision(store, context, "policies.activity.allowed", "Policy activity read.", purpose, "allow", policy_id)
    return store.list_policy_activity(policy_id)


@app.post("/api/policies/{policy_id}/revisions/{revision_id}/approve", response_model=PolicyGroup)
def approve_policy_revision(
    policy_id: str,
    revision_id: str,
    action: RevisionActionRequest | None = None,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> PolicyGroup:
    purpose = protected_purpose(x_travel_purpose, store, context, "policies.approve.denied")
    revision, policy = _load_policy_revision(store, context, policy_id, revision_id, purpose)
    approved = revision.model_copy(
        update={
            "status": "Approved",
            "reviewer_comments": [*revision.reviewer_comments, action.comment] if action and action.comment else revision.reviewer_comments,
            "updated_at": datetime.now(timezone.utc),
        }
    )
    saved = store.save_policy_revision(policy.id, approved, context.email, "Policy revision approved for publication.")
    if saved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    audit_security_decision(store, context, "policies.approve.allowed", "Policy revision approved.", purpose, "allow", policy.id)
    return saved


@app.post("/api/policies/{policy_id}/revisions/{revision_id}/request-changes", response_model=PolicyGroup)
def request_policy_revision_changes(
    policy_id: str,
    revision_id: str,
    action: RevisionActionRequest | None = None,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> PolicyGroup:
    purpose = protected_purpose(x_travel_purpose, store, context, "policies.request_changes.denied")
    revision, policy = _load_policy_revision(store, context, policy_id, revision_id, purpose)
    changed = revision.model_copy(
        update={
            "status": "Changes Requested",
            "reviewer_comments": [*revision.reviewer_comments, action.comment or "Changes requested."] if action else [*revision.reviewer_comments, "Changes requested."],
            "updated_at": datetime.now(timezone.utc),
        }
    )
    saved = store.save_policy_revision(policy.id, changed, context.email, "Policy revision changes requested.")
    if saved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    audit_security_decision(store, context, "policies.request_changes.allowed", "Policy revision changes requested.", purpose, "allow", policy.id)
    return saved


@app.post("/api/corporate/requests/{request_id}/notifications", response_model=EmailEvent)
def send_corporate_request_notification(
    request_id: str,
    notification: NotificationRequest,
    x_travel_purpose: str | None = Header(default=None),
    context: AuthContext = Depends(require_auth),
    store: TravelStore = Depends(get_store),
) -> EmailEvent:
    purpose = protected_purpose(x_travel_purpose, store, context, "corporate.notification.denied")
    try:
        ensure_scope(context, "travel:plan", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "corporate.notification.denied", str(exc), purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    request = _load_authorized_corporate_request(store, context, request_id, purpose)
    if notification.kind == "final_itinerary" and (request.status != "Finalized" or not request.generated_plan):
        audit_security_decision(store, context, "corporate.notification.blocked", "Final itinerary is not ready.", purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Final itinerary is not ready")
    attachment = _corporate_request_workbook_bytes(request) if notification.attach_itinerary else None
    event = send_resend_notification(request_id, request, notification, attachment)
    saved = store.save_email_event(event)
    audit_security_decision(store, context, "corporate.notification.recorded", saved.safe_message, purpose, "allow", request_id)
    return saved


@app.post("/api/mail/resend/webhook", response_model=EmailEvent)
async def record_resend_webhook(request: Request, store: TravelStore = Depends(get_store)) -> EmailEvent:
    payload = await request.body()
    _verify_resend_webhook(payload, request)
    try:
        event = ResendWebhookEvent.model_validate_json(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook") from exc
    data = event.data or {}
    tags = data.get("tags") if isinstance(data.get("tags"), dict) else {}
    request_id = tags.get("request_id") if isinstance(tags, dict) else None
    kind = tags.get("kind") if isinstance(tags, dict) else None
    recorded = EmailEvent(
        request_id=str(request_id) if request_id else None,
        kind=kind if kind in {"approval_request", "document_update", "final_itinerary"} else None,
        status="received",
        to=[str(item) for item in data.get("to", [])] if isinstance(data.get("to"), list) else [],
        subject=str(data.get("subject") or ""),
        provider_message_id=str(data.get("email_id") or ""),
        safe_message=f"Resend webhook received: {event.type}",
    )
    return store.save_email_event(recorded)


def _verify_resend_webhook(payload: bytes, request: Request) -> None:
    secret = os.getenv("RESEND_WEBHOOK_SECRET")
    if not secret:
        return
    svix_id = request.headers.get("svix-id")
    timestamp = request.headers.get("svix-timestamp")
    signature = request.headers.get("svix-signature")
    if not svix_id or not timestamp or not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook")
    secret_bytes = _decode_svix_secret(secret)
    signed_payload = b".".join([svix_id.encode("utf-8"), timestamp.encode("utf-8"), payload])
    expected = base64.b64encode(hmac.new(secret_bytes, signed_payload, hashlib.sha256).digest()).decode("ascii")
    signatures = [part.removeprefix("v1,") for part in signature.split()]
    if not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook")


def _decode_svix_secret(secret: str) -> bytes:
    if not secret.startswith("whsec_"):
        return secret.encode("utf-8")
    try:
        return base64.b64decode(secret.removeprefix("whsec_"), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook") from exc


def _load_authorized_corporate_request(store: TravelStore, context: AuthContext, request_id: str, purpose: str) -> CorporateTravelRequest:
    request = store.get_corporate_request(request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    is_admin = "admin:summary" in context.scopes
    if not is_admin and request.owner_id != context.user_id:
        audit_security_decision(store, context, "corporate.request.denied", "Corporate request access denied.", purpose, "deny", request_id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return request


def _load_policy_group(store: TravelStore, context: AuthContext, policy_id: str, purpose: str) -> PolicyGroup:
    try:
        ensure_any_scope(context, {"policy:read", "policy:write", "admin:summary"}, purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "policies.access.denied", str(exc), purpose, "deny", policy_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    policy = store.get_policy_group(policy_id)
    if policy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return policy


def _load_policy_revision(store: TravelStore, context: AuthContext, policy_id: str, revision_id: str, purpose: str) -> tuple[PolicyRevision, PolicyGroup]:
    try:
        ensure_scope(context, "policy:write", purpose)
    except SecurityError as exc:
        audit_security_decision(store, context, "policies.write.denied", str(exc), purpose, "deny", policy_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    policy = _load_policy_group(store, context, policy_id, purpose)
    for revision in policy.revisions:
        if revision.id == revision_id:
            return revision, policy
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _sheet_rows(workbook: Any, sheet_name: str) -> list[dict[str, object]]:
    if sheet_name not in workbook.sheetnames:
        return []
    sheet = workbook[sheet_name]
    values = list(sheet.iter_rows(values_only=True))
    if not values:
        return []
    headers = [_header_name(value) for value in values[0]]
    rows: list[dict[str, object]] = []
    for raw_row in values[1:]:
        row: dict[str, object] = {}
        for index, value in enumerate(raw_row):
            if index >= len(headers) or not headers[index] or value is None:
                continue
            if isinstance(value, datetime):
                value = value.date()
            row[headers[index]] = value
        if row:
            rows.append(row)
    return rows


def _corporate_template_workbook_bytes() -> bytes:
    from openpyxl import Workbook

    workbook = Workbook()
    requests = workbook.active
    requests.title = "Travel Requests"
    requests.append(
        [
            "traveler_name",
            "traveler_email",
            "employee_id",
            "department",
            "nationality",
            "origin",
            "phone",
            "employee_level",
            "destination",
            "destination_country",
            "depart_date",
            "return_date",
            "trip_purpose",
            "meeting_location",
            "flexible_dates",
            "cabin",
            "total_budget",
            "currency",
            "passport_expiry",
            "visa_status",
            "visa_expiry",
            "approval_manager_email",
            "preferred_airline",
            "flight_preference",
            "hotel_preference",
            "preferred_hotel_area",
            "hotel_star_rating",
            "past_hotel_preference",
            "airport_transfer_needed",
            "meal_preference",
            "seat_preference",
            "timing_preference",
            "medical_notes",
            "accessibility_notes",
            "extra_baggage_notes",
            "special_requests",
        ]
    )
    requests.append(
        [
            "Anika Rao",
            "anika.rao@example.com",
            "E-101",
            "Sales",
            "India",
            "Hyderabad",
            "+91 98765 43210",
            "Manager",
            "Johannesburg",
            "South Africa",
            "2026-06-10",
            "2026-06-17",
            "Client workshops",
            "Sandton client office",
            "yes",
            "economy",
            1900,
            "USD",
            "2028-01-15",
            "Valid visa on file",
            "2027-08-20",
            "manager@example.com",
            "Qatar Airways",
            "Short layover",
            "Business hotel near client office",
            "Sandton",
            "4",
            "Garden Court",
            "yes",
            "Vegetarian",
            "Aisle",
            "Morning arrival",
            "None",
            "None",
            "One sample kit",
            "Airport pickup; late check-in",
        ]
    )

    policy = workbook.create_sheet("Company Policy")
    policy.append(["policy_tier", "allowed_cabins", "max_budget", "currency", "approval_rule", "notes"])
    policy.append(["standard", "economy,premium_economy", 1950, "USD", "manager approval above budget", "Prefer refundable fares for client-facing trips"])

    history = workbook.create_sheet("Traveller History")
    history.append(["traveler_email", "preferred_airline", "meal_preference", "seat_preference", "hotel_notes", "notes"])
    history.append(["anika.rao@example.com", "Qatar Airways", "Vegetarian", "Aisle", "Prefers hotels near office", "Past trips favored short layovers"])

    visa = workbook.create_sheet("Visa Rules")
    visa.append(["from_country", "destination_country", "visa_required", "transit_notes", "notes"])
    visa.append(["India", "South Africa", "yes", "Check transit visa if route changes", "Business visa must be valid for full stay"])

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _corporate_request_workbook_bytes(request: CorporateTravelRequest) -> bytes:
    from openpyxl import Workbook

    workbook = Workbook()
    summary = workbook.active
    summary.title = "Request"
    summary.append(["field", "value"])
    summary.append(["request_id", request.id])
    summary.append(["traveler_name", request.traveller_details.traveler_name or ""])
    summary.append(["traveler_email", request.traveller_details.traveler_email or ""])
    summary.append(["company_name", request.company_details.company_name or ""])
    summary.append(["origin", request.travel_details.origin or ""])
    summary.append(["destination", request.travel_details.destination or ""])
    summary.append(["depart_date", request.travel_details.depart_date.isoformat() if request.travel_details.depart_date else ""])
    summary.append(["return_date", request.travel_details.return_date.isoformat() if request.travel_details.return_date else ""])
    summary.append(["trip_purpose", request.travel_details.trip_purpose or ""])
    summary.append(["budget", request.budgets.total_budget or ""])
    summary.append(["currency", request.budgets.currency])
    summary.append(["status", request.status])

    plans = workbook.create_sheet("Recommended Plans")
    plans.append(["option_name", "flight_summary", "hotel_summary", "estimated_cost", "policy_status", "recommendation_reason"])
    if request.generated_plan:
        for option in request.generated_plan.travel_options:
            plans.append(
                [
                    option.option_name,
                    option.flight_summary,
                    option.hotel_summary,
                    option.estimated_cost,
                    option.policy_status,
                    option.recommendation_reason,
                ]
            )

    itinerary = workbook.create_sheet("Final Itinerary")
    itinerary.append(["section", "value"])
    if request.generated_plan:
        itinerary.append(["customer_message", request.generated_plan.customer_message_draft])
        itinerary.append(["final_itinerary", request.generated_plan.customer_itinerary_draft])
        itinerary.append(["agent_note", request.generated_plan.agent_note])

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _corporate_request_from_row(row: dict[str, object], context: AuthContext, now: datetime) -> CorporateTravelRequest:
    special = row.get("special_requests") or row.get("special_request") or ""
    return CorporateTravelRequest(
        owner_id=context.user_id,
        owner_department=context.department,
        status="New",
        traveller_details=TravellerDetails(
            traveler_name=_str(row, "traveler_name", "traveller_name", "name"),
            traveler_email=_str(row, "traveler_email", "traveller_email", "email"),
            phone=_str(row, "phone", "phone_number", "mobile"),
            employee_id=_str(row, "employee_id"),
            employee_level=_str(row, "employee_level", "level"),
            department=_str(row, "department"),
            nationality=_str(row, "nationality", "citizenship"),
            passport_number=_str(row, "passport_number"),
            passport_expiry=_date_value(row.get("passport_expiry")),
            visa_status=_str(row, "visa_status", "visa"),
            visa_expiry=_date_value(row.get("visa_expiry")),
            medical_notes=_str(row, "medical_notes", "medical_accessibility_notes"),
            accessibility_notes=_str(row, "accessibility_notes"),
        ),
        company_details=CompanyDetails(
            company_name=_str(row, "company_name"),
            cost_center=_str(row, "cost_center"),
            approving_manager=_str(row, "approving_manager", "manager"),
            approval_manager_email=_str(row, "approval_manager_email", "approving_manager_email", "manager_email"),
            policy_tier=_str(row, "policy_tier"),
        ),
        travel_details=TravelDetails(
            origin=_str(row, "origin", "from"),
            destination=_str(row, "destination", "to"),
            destination_country=_str(row, "destination_country", "country"),
            depart_date=_date_value(row.get("depart_date") or row.get("departure_date")),
            return_date=_date_value(row.get("return_date")),
            trip_purpose=_str(row, "trip_purpose", "purpose"),
            meeting_location=_str(row, "meeting_location"),
            flexible_dates=_bool_value(row.get("flexible_dates")),
            travelers=_int_value(row.get("travelers") or row.get("travellers") or 1, default=1),
            cabin=_cabin_value(row.get("cabin")),
        ),
        preferences=TravelPreferences(
            preferred_airline=_str(row, "preferred_airline"),
            flight_preference=_str(row, "flight_preference"),
            hotel_preference=_str(row, "hotel_preference"),
            preferred_hotel_area=_str(row, "preferred_hotel_area"),
            hotel_star_rating=_str(row, "hotel_star_rating"),
            past_hotel_preference=_str(row, "past_hotel_preference"),
            airport_transfer_needed=_bool_value(row.get("airport_transfer_needed")),
            meal_preference=_str(row, "meal_preference"),
            seat_preference=_str(row, "seat_preference"),
            timing_preference=_str(row, "timing_preference"),
        ),
        budgets=TravelBudget(
            total_budget=_optional_int(row.get("total_budget") or row.get("budget_usd") or row.get("budget")),
            currency=_str(row, "currency") or "USD",
            max_flight_budget=_optional_int(row.get("max_flight_budget")),
            max_hotel_budget=_optional_int(row.get("max_hotel_budget")),
            policy_notes=_str(row, "policy_notes"),
            extra_baggage_notes=_str(row, "extra_baggage_notes"),
        ),
        special_requests=[item.strip() for item in str(special).replace(";", ",").split(",") if item and item.strip()],
        created_at=now,
        updated_at=now,
    )


def _header_name(value: object) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


def _str(row: dict[str, object], *keys: str) -> str | None:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _date_value(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value is None or not str(value).strip():
        return None
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError:
        return None


def _optional_int(value: object) -> int | None:
    if value is None or not str(value).strip():
        return None
    return _int_value(value, default=0) or None


def _bool_value(value: object) -> bool:
    return str(value or "").strip().lower() in {"true", "yes", "y", "1"}


def _int_value(value: object, default: int) -> int:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def _cabin_value(value: object) -> str:
    clean = str(value or "economy").strip().lower().replace(" ", "_")
    return clean if clean in {"economy", "premium_economy", "business", "first"} else "economy"
