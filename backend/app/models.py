from datetime import date, datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


Cabin = Literal["economy", "premium_economy", "business", "first"]
Risk = Literal["low", "medium", "high"]
TripStatus = Literal["draft", "submitted", "booked", "cancelled"]
UserRole = Literal["traveler", "travel_manager", "finance_admin", "security_admin"]
CorporateRequestStatus = Literal[
    "New",
    "New Entries",
    "Missing Info",
    "Pending Details",
    "Processing",
    "Ready for Planning",
    "Plan Generated",
    "Waiting for Approval",
    "Finalized",
    "Completed",
    "Cancelled",
]
CorporateApprovalStatus = Literal["Not Required", "Required", "Received", "Rejected"]
CorporateCriticalIssueStatus = Literal["None", "Urgent", "Resolved"]
NotificationKind = Literal["approval_request", "review_link", "document_update", "final_itinerary"]
EmailDeliveryStatus = Literal["sent", "configuration_required", "failed", "received"]
PolicyRevisionStatus = Literal["Draft", "Proposed", "In Review", "Approved", "Changes Requested", "Archived"]
TravelerStatus = Literal["Compliant", "Passport Expiring", "Missing Passport", "Document Update Required"]
ClientReviewStatus = Literal["Not Sent", "Sent", "Changes Requested", "Approved", "Agent Review Required", "Expired"]


class TravelRequest(BaseModel):
    origin: str = Field(..., min_length=2, max_length=80)
    destination: str = Field(..., min_length=2, max_length=120)
    depart_date: date
    return_date: date | None = None
    travelers: int = Field(default=1, ge=1, le=9)
    cabin: Cabin = "economy"
    budget_usd: int | None = Field(default=None, ge=1)
    purpose: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_dates(self) -> "TravelRequest":
        if self.return_date and self.return_date < self.depart_date:
            raise ValueError("return_date must be on or after depart_date")
        return self


class TravellerDetails(BaseModel):
    traveler_name: str | None = Field(default=None, max_length=120)
    traveler_email: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    employee_id: str | None = Field(default=None, max_length=80)
    employee_level: str | None = Field(default=None, max_length=80)
    department: str | None = Field(default=None, max_length=120)
    nationality: str | None = Field(default=None, max_length=80)
    passport_number: str | None = Field(default=None, max_length=40)
    passport_expiry: date | None = None
    visa_status: str | None = Field(default=None, max_length=120)
    visa_expiry: date | None = None
    medical_notes: str | None = Field(default=None, max_length=500)
    accessibility_notes: str | None = Field(default=None, max_length=500)


class CompanyDetails(BaseModel):
    company_name: str | None = Field(default=None, max_length=160)
    cost_center: str | None = Field(default=None, max_length=100)
    approving_manager: str | None = Field(default=None, max_length=120)
    approval_manager_email: str | None = Field(default=None, max_length=120)
    policy_tier: str | None = Field(default=None, max_length=80)


class TravelDetails(BaseModel):
    origin: str | None = Field(default=None, max_length=120)
    destination: str | None = Field(default=None, max_length=120)
    destination_country: str | None = Field(default=None, max_length=80)
    depart_date: date | None = None
    return_date: date | None = None
    trip_purpose: str | None = Field(default=None, max_length=240)
    meeting_location: str | None = Field(default=None, max_length=240)
    flexible_dates: bool = False
    include_outbound_flight: bool = True
    include_return_flight: bool = True
    include_hotel: bool = True
    travelers: int = Field(default=1, ge=1, le=9)
    cabin: Cabin = "economy"

    @model_validator(mode="after")
    def validate_dates(self) -> "TravelDetails":
        if self.depart_date and self.return_date and self.return_date < self.depart_date:
            raise ValueError("return_date must be on or after depart_date")
        return self


class TravelPreferences(BaseModel):
    preferred_airline: str | None = Field(default=None, max_length=120)
    flight_preference: str | None = Field(default=None, max_length=160)
    hotel_preference: str | None = Field(default=None, max_length=160)
    preferred_hotel_area: str | None = Field(default=None, max_length=160)
    hotel_star_rating: str | None = Field(default=None, max_length=40)
    past_hotel_preference: str | None = Field(default=None, max_length=160)
    airport_transfer_needed: bool = False
    meal_preference: str | None = Field(default=None, max_length=120)
    seat_preference: str | None = Field(default=None, max_length=80)
    timing_preference: str | None = Field(default=None, max_length=120)


class TravelBudget(BaseModel):
    total_budget: int | None = Field(default=None, ge=1)
    currency: str = Field(default="USD", max_length=8)
    max_flight_budget: int | None = Field(default=None, ge=1)
    max_hotel_budget: int | None = Field(default=None, ge=1)
    policy_notes: str | None = Field(default=None, max_length=500)
    extra_baggage_notes: str | None = Field(default=None, max_length=500)


class CorporateTravelRequest(BaseModel):
    id: str = Field(default_factory=lambda: f"corp_req_{uuid4().hex[:12]}")
    owner_id: str = Field(default="")
    owner_department: str = Field(default="general")
    status: CorporateRequestStatus = "New"
    approval_status: CorporateApprovalStatus = "Not Required"
    traveller_details: TravellerDetails = Field(default_factory=TravellerDetails)
    company_details: CompanyDetails = Field(default_factory=CompanyDetails)
    travel_details: TravelDetails = Field(default_factory=TravelDetails)
    preferences: TravelPreferences = Field(default_factory=TravelPreferences)
    budgets: TravelBudget = Field(default_factory=TravelBudget)
    special_requests: list[str] = Field(default_factory=list)
    critical_issue: str | None = Field(default=None, max_length=240)
    critical_issue_status: CorporateCriticalIssueStatus = "None"
    generated_plan: "CorporateTravelPlan | None" = None
    client_review: "CorporateClientReview | None" = None
    client_review_history: list["CorporateClientReviewEvent"] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TravelReadiness(BaseModel):
    passport_status: str
    visa_status: str
    transit_warning: str
    document_notes: list[str] = Field(default_factory=list)


class BudgetPolicyCheck(BaseModel):
    budget_status: Literal["Within Budget", "Needs Approval", "Out of Budget", "Needs Review"]
    policy_status: Literal["Compliant", "Needs Approval", "Policy Violation", "Needs Review"]
    approval_required: bool
    approval_reason: str
    total_budget: int | None = None
    estimated_cost: int


class TravelOption(BaseModel):
    option_name: Literal["Best within budget", "Fastest route", "Comfort-focused option"]
    flight_offer_id: str | None = None
    ground_transfer_offer_id: str | None = None
    flight_summary: str
    hotel_summary: str
    transfer_summary: str = "Airport transfer pending."
    estimated_cost: int
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    policy_status: str
    recommendation_reason: str


class CorporateFlightOffer(BaseModel):
    id: str
    provider: str
    airline: str
    summary: str
    total_amount: int
    currency: str = "USD"
    outbound: str
    return_leg: str | None = None
    cabin: Cabin = "economy"
    expires_at: str | None = None
    source: Literal["duffel", "synthetic"] = "synthetic"
    notes: list[str] = Field(default_factory=list)


class CorporateHotelOffer(BaseModel):
    id: str
    provider: str
    name: str
    summary: str
    total_amount: int
    currency: str = "USD"
    address: str | None = None
    star_rating: float | None = None
    check_in: date | None = None
    check_out: date | None = None
    check_in_starts_at: str | None = Field(default=None, max_length=40)
    checkout_time: str | None = Field(default=None, max_length=40)
    room_notes: str | None = Field(default=None, max_length=240)
    cancellation_notes: str | None = Field(default=None, max_length=240)
    unsent_special_requests: list[str] = Field(default_factory=list)
    nights: int = 1
    rooms: int = 1
    guests: int = 1
    image_url: str | None = None
    source: Literal["booking", "synthetic"] = "synthetic"
    notes: list[str] = Field(default_factory=list)


class CorporateGroundTransferOffer(BaseModel):
    id: str
    provider: str
    offer_id: str | None = None
    pickup_airport_code: str
    pickup_time: str | None = None
    dropoff_label: str
    dropoff_address: str | None = None
    service_type: str
    vehicle_type: str | None = None
    passengers: int = Field(default=1, ge=1)
    baggage: str | None = None
    total_amount: int
    currency: str = "USD"
    cancellation_notes: str | None = None
    source: Literal["amadeus", "synthetic"] = "synthetic"
    notes: list[str] = Field(default_factory=list)


class CorporateTravelPlan(BaseModel):
    request_summary: str
    missing_information: list[str] = Field(default_factory=list)
    travel_readiness: TravelReadiness
    budget_policy_check: BudgetPolicyCheck
    travel_options: list[TravelOption] = Field(default_factory=list, min_length=3, max_length=3)
    flight_offers: list[CorporateFlightOffer] = Field(default_factory=list)
    selected_flight_offer_id: str | None = None
    hotel_offers: list[CorporateHotelOffer] = Field(default_factory=list)
    selected_hotel_offer_id: str | None = None
    ground_transfer_offers: list[CorporateGroundTransferOffer] = Field(default_factory=list)
    selected_ground_transfer_offer_id: str | None = None
    agent_note: str
    agent_notes: list[str] = Field(default_factory=list)
    customer_message_draft: str
    customer_itinerary_draft: str
    approval_status: CorporateRequestStatus


class CorporateClientReviewEvent(BaseModel):
    id: str = Field(default_factory=lambda: f"review_evt_{uuid4().hex[:12]}")
    action: Literal["sent", "approved", "edits_requested", "agent_review_required"]
    revision_round: int = Field(default=0, ge=0)
    selected_option_index: int | None = Field(default=None, ge=1, le=3)
    edit_request_text: str | None = Field(default=None, max_length=1000)
    change_summary: str | None = Field(default=None, max_length=600)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CorporateClientReview(BaseModel):
    status: ClientReviewStatus = "Not Sent"
    token_id: str | None = None
    review_url: str | None = None
    selected_option_index: int | None = Field(default=None, ge=1, le=3)
    edit_request_text: str | None = Field(default=None, max_length=1000)
    revision_round: int = Field(default=0, ge=0)
    change_summary: str | None = Field(default=None, max_length=600)
    expires_at: datetime | None = None
    sent_at: datetime | None = None
    submitted_at: datetime | None = None


class CorporateReviewSubmitRequest(BaseModel):
    action: Literal["approve", "request_edits"]
    selected_option_index: int | None = Field(default=None, ge=1, le=3)
    edit_request_text: str | None = Field(default=None, max_length=1000)


class CorporateReviewFlight(BaseModel):
    id: str
    airline: str
    summary: str
    outbound: str
    return_leg: str | None = None
    cabin: Cabin
    total_amount: int
    currency: str
    notes: list[str] = Field(default_factory=list)


class CorporateReviewHotel(BaseModel):
    id: str
    name: str
    summary: str
    address: str | None = None
    check_in: date | None = None
    check_out: date | None = None
    check_in_starts_at: str | None = None
    checkout_time: str | None = None
    room_notes: str | None = None
    cancellation_notes: str | None = None
    unsent_special_requests: list[str] = Field(default_factory=list)
    total_amount: int
    currency: str


class CorporateReviewTransfer(BaseModel):
    id: str
    pickup_airport_code: str
    pickup_time: str | None = None
    dropoff_label: str
    dropoff_address: str | None = None
    service_type: str
    vehicle_type: str | None = None
    passengers: int
    baggage: str | None = None
    total_amount: int
    currency: str
    cancellation_notes: str | None = None
    notes: list[str] = Field(default_factory=list)


class CorporateReviewOption(BaseModel):
    option_index: int = Field(..., ge=1, le=3)
    option_name: str
    flight_summary: str
    hotel_summary: str
    transfer_summary: str
    estimated_cost: int
    currency: str
    policy_status: str
    recommendation_reason: str
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    flight: CorporateReviewFlight | None = None
    hotel: CorporateReviewHotel | None = None
    transfer: CorporateReviewTransfer | None = None


class CorporateReviewResponse(BaseModel):
    request_id: str
    traveler_name: str
    company_name: str
    route: str
    depart_date: date | None = None
    return_date: date | None = None
    status: ClientReviewStatus
    revision_round: int
    expires_at: datetime | None = None
    submitted_at: datetime | None = None
    change_summary: str | None = None
    special_request_notice: str
    options: list[CorporateReviewOption] = Field(default_factory=list, min_length=3, max_length=3)
    history: list[CorporateClientReviewEvent] = Field(default_factory=list)


class CorporatePipelineEvent(BaseModel):
    id: str
    source: Literal["request", "audit", "email"]
    stage: str
    status: str
    message: str
    created_at: datetime
    review_round: int | None = None


class CorporateRequestStatusUpdate(BaseModel):
    status: CorporateRequestStatus


class CorporateCriticalIssueUpdate(BaseModel):
    issue: str | None = Field(default=None, max_length=240)
    status: CorporateCriticalIssueStatus = "Urgent"


class CorporateFinalizeRequest(BaseModel):
    agent_reviewed: bool = False
    approval_status: CorporateApprovalStatus | None = None


class CorporateClientApprovalRequest(BaseModel):
    selected_option_name: str | None = Field(default=None, max_length=80)
    selected_option_index: int | None = Field(default=None, ge=1, le=3)


class CorporatePlanUpdate(BaseModel):
    generated_plan: CorporateTravelPlan
    budgets: TravelBudget | None = None
    traveller_details: TravellerDetails | None = None
    company_details: CompanyDetails | None = None
    travel_details: TravelDetails | None = None
    preferences: TravelPreferences | None = None
    special_requests: list[str] | None = None


class CorporateImportResponse(BaseModel):
    request_count: int
    policy_count: int
    traveller_history_count: int
    employee_profile_count: int = 0
    visa_rule_count: int
    created_request_ids: list[str]


class CompanyPolicyImportResponse(BaseModel):
    company_name: str
    policy_count: int
    rules: list[str] = Field(default_factory=list)


class CompanyPipelineStatus(BaseModel):
    company_name: str
    traveler_count: int = 0
    traveler_list_status: Literal["Updated", "Missing"] = "Missing"
    policy_status: Literal["Uploaded", "Missing"] = "Missing"
    policy_count: int = 0
    visa_record_count: int = 0
    history_row_count: int = 0


class CorporateDestinationCount(BaseModel):
    destination: str
    count: int


class CorporateAdminSummary(BaseModel):
    total_requests: int
    by_status: dict[str, int]
    approval_required: int
    finalized: int
    missing_info: int = 0
    visa_issues: int = 0
    average_handling_time_hours: float = 0
    common_destinations: list[CorporateDestinationCount] = Field(default_factory=list)


class Offer(BaseModel):
    id: str = Field(default_factory=lambda: f"offer_{uuid4().hex[:12]}")
    kind: Literal["flight", "hotel"]
    title: str
    provider: str
    price_usd: int
    currency: str = "USD"
    refundable: bool = False
    notes: list[str] = Field(default_factory=list)
    flight_legs: list["FlightLeg"] = Field(default_factory=list)


class FlightLeg(BaseModel):
    direction: Literal["outbound", "return"]
    origin: str
    destination: str
    departure_at: str | None = None
    arrival_at: str | None = None
    stops: int | None = None
    airline: str | None = None


class ItineraryItem(BaseModel):
    day: int = Field(..., ge=1)
    title: str
    details: str


class Trip(BaseModel):
    id: str = Field(default_factory=lambda: f"trip_{uuid4().hex[:12]}")
    owner_id: str = Field(default="")
    owner_department: str = Field(default="general")
    request: TravelRequest
    status: TripStatus = "draft"
    risk: Risk = "low"
    flight_offers: list[Offer] = Field(default_factory=list)
    hotel_offers: list[Offer] = Field(default_factory=list)
    itinerary: list[ItineraryItem] = Field(default_factory=list)
    policy_checks: list[str] = Field(default_factory=list)
    savings_suggestions: list[str] = Field(default_factory=list)
    sensitive_context: dict[str, Any] = Field(default_factory=dict, exclude=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditEvent(BaseModel):
    id: str = Field(default_factory=lambda: f"audit_{uuid4().hex[:12]}")
    trip_id: str | None = None
    actor_id: str | None = None
    event_type: str
    message: str
    purpose: str | None = None
    decision: Literal["allow", "deny", "record"] = "record"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TravelerDocument(BaseModel):
    document_type: Literal["passport", "visa", "known_traveler", "other"]
    label: str
    status: Literal["Ready", "Expiring Soon", "Missing", "Needs Review"]
    expires_at: date | None = None
    redacted_value: str | None = None


class LoyaltyProgram(BaseModel):
    provider: str
    tier: str | None = None
    account_ref: str | None = None


class TravelerProfile(BaseModel):
    id: str = Field(default_factory=lambda: f"traveler_{uuid4().hex[:12]}")
    name: str
    email: str
    company: str
    department: str | None = None
    vip_level: str | None = None
    status: TravelerStatus = "Compliant"
    location: str | None = None
    seat_preference: str | None = None
    meal_preference: str | None = None
    hotel_preference: str | None = None
    policy_notes: list[str] = Field(default_factory=list)
    loyalty_programs: list[LoyaltyProgram] = Field(default_factory=list)
    documents: list[TravelerDocument] = Field(default_factory=list)
    recent_trips: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PolicyRule(BaseModel):
    label: str
    value: str
    status: Literal["Active", "Draft", "Changed", "Removed"] = "Active"


class PolicyRevision(BaseModel):
    id: str = Field(default_factory=lambda: f"policy_rev_{uuid4().hex[:12]}")
    version: str
    status: PolicyRevisionStatus = "Draft"
    summary: str
    proposed_rules: list[PolicyRule] = Field(default_factory=list)
    impact_analysis: str | None = None
    reviewer_comments: list[str] = Field(default_factory=list)
    created_by: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PolicyGroup(BaseModel):
    id: str = Field(default_factory=lambda: f"policy_{uuid4().hex[:12]}")
    client_name: str
    business_unit: str | None = None
    status: Literal["Active", "Draft", "Archived"] = "Active"
    active_rules: list[PolicyRule] = Field(default_factory=list)
    revisions: list[PolicyRevision] = Field(default_factory=list)
    compliance_score: float = 0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PolicyActivityEvent(BaseModel):
    id: str = Field(default_factory=lambda: f"policy_evt_{uuid4().hex[:12]}")
    policy_id: str | None = None
    actor: str
    activity: str
    status: Literal["SUCCESS", "PENDING AUDIT", "REVIEW", "FAILED"] = "SUCCESS"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RevisionActionRequest(BaseModel):
    comment: str | None = Field(default=None, max_length=500)


class NotificationRequest(BaseModel):
    kind: NotificationKind
    to: list[str] = Field(default_factory=list, min_length=1)
    cc: list[str] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=1000)
    review_url: str | None = Field(default=None, max_length=2000)
    change_summary: str | None = Field(default=None, max_length=600)
    review_round: int | None = Field(default=None, ge=0)
    attach_itinerary: bool = False


class EmailEvent(BaseModel):
    id: str = Field(default_factory=lambda: f"email_evt_{uuid4().hex[:12]}")
    request_id: str | None = None
    kind: NotificationKind | None = None
    provider: Literal["resend"] = "resend"
    status: EmailDeliveryStatus
    to: list[str] = Field(default_factory=list)
    subject: str | None = None
    provider_message_id: str | None = None
    safe_message: str
    body_text: str | None = None
    attachment_names: list[str] = Field(default_factory=list)
    review_round: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ResendWebhookEvent(BaseModel):
    type: str
    created_at: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class TravelerBudgetUsage(BaseModel):
    traveler_ref: str
    department: str
    trip_count: int
    spend_usd: int
    policy_flags: int
    visa_status: Literal["ok", "expiring_soon", "unknown"] = "unknown"


class AdminSummary(BaseModel):
    total_trips: int
    draft_trips: int
    booked_trips: int
    high_risk_trips: int
    audit_events: int
    budget_utilization_usd: int = 0
    visa_expiring_soon: int = 0
    policy_updates_due: int = 0
    budget_by_traveler: list[TravelerBudgetUsage] = Field(default_factory=list)


class PlanResponse(BaseModel):
    trip: Trip
    risk: Risk
    user_message: str
    audit_events: list[AuditEvent]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    trip: Trip | None = None
    budget_context: list[dict[str, Any]] = Field(default_factory=list, max_length=6)
    source_context: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    message: str
    model: str
    audit_events: list[AuditEvent] = Field(default_factory=list)


class AuthContext(BaseModel):
    user_id: str
    email: str
    role: UserRole
    department: str
    scopes: list[str]
    manager_scope: list[str] = Field(default_factory=list)
    token_expires_at: int


class AuthTokenRequest(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=120)
    username: str | None = Field(default=None, min_length=3, max_length=80)
    password: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_identifier(self) -> "AuthTokenRequest":
        if not self.email and not self.username:
            raise ValueError("email or username is required")
        return self


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: int
    user: AuthContext


SupportedCurrency = Literal["USD", "INR", "EUR", "GBP", "CAD", "AUD", "JPY", "ZAR"]


class CurrencyConversionRequest(BaseModel):
    amount_usd: int = Field(..., ge=0)
    to_currency: SupportedCurrency = "USD"


class CurrencyConversionResponse(BaseModel):
    amount: float
    currency: SupportedCurrency
    rate: float
    display: str
    source: Literal["mcp", "daily_backup_rate", "planning_rate"] = "planning_rate"
