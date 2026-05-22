import json
import os
from datetime import timedelta
from typing import Any

from .models import (
    AuditEvent,
    AuthContext,
    BudgetPolicyCheck,
    ChatRequest,
    ChatResponse,
    CorporateTravelPlan,
    CorporateTravelRequest,
    FlightLeg,
    ItineraryItem,
    Offer,
    PlanResponse,
    TravelOption,
    TravelReadiness,
    TravelRequest,
    Trip,
)
from .security import risk_label


def plan_trip(request: TravelRequest, owner_id: str = "", owner_department: str = "general") -> PlanResponse:
    risk = risk_label(request)
    nights = _nights(request)

    live_flights, live_hotels, live_events = _live_provider_offers(request, owner_id)
    flight_offers = live_flights or [_fallback_flight_offer(request)]
    hotel_offers = live_hotels or [_fallback_hotel_offer(request, nights)]
    primary_total = (flight_offers[0].price_usd if flight_offers else _flight_price(request)) + (
        hotel_offers[0].price_usd if hotel_offers else 160 * nights
    )
    trip = Trip(
        owner_id=owner_id,
        owner_department=owner_department,
        request=request,
        risk=risk,
        flight_offers=flight_offers,
        hotel_offers=hotel_offers,
        itinerary=_itinerary(request, nights),
        policy_checks=_policy_checks(request, risk, primary_total),
        savings_suggestions=_savings_suggestions(request),
    )

    events = [
        AuditEvent(
            trip_id=trip.id,
            actor_id=owner_id or None,
            event_type="plan.created",
            message="Created travel plan with live provider search where configured.",
        ),
        AuditEvent(trip_id=trip.id, actor_id=owner_id or None, event_type="risk.assessed", message=f"Risk classified as {risk}."),
        *live_events,
    ]
    if _llm_ready():
        events.append(AuditEvent(trip_id=trip.id, actor_id=owner_id or None, event_type="llm.available", message=f"{_llm_provider_name()} planning assist configured."))

    return PlanResponse(
        trip=trip,
        risk=risk,
        user_message=(
            "Provider-backed planning completed where configured. Any unavailable segment is marked for manual sourcing "
            "before pricing, approval, or final itinerary decisions."
        ),
        audit_events=events,
    )


def generate_corporate_plan(
    request: CorporateTravelRequest,
    policy_rows: list[dict[str, object]] | None = None,
    traveller_history_rows: list[dict[str, object]] | None = None,
    visa_rule_rows: list[dict[str, object]] | None = None,
) -> CorporateTravelPlan:
    missing = _corporate_missing_information(request)
    nights = _corporate_nights(request)
    options = _corporate_options(request, nights)
    best_cost = options[0].estimated_cost
    readiness = _travel_readiness(request, visa_rule_rows or [])
    budget_check = _budget_policy_check(request, best_cost, policy_rows or [], options)
    if readiness.passport_status == "Blocking Issue" or readiness.visa_status == "Blocking Issue":
        budget_check.approval_required = True
        reason = "Document readiness has a blocking issue."
        if budget_check.approval_reason:
            reason = f"{budget_check.approval_reason} {reason}"
        budget_check.approval_reason = reason

    history_note = _history_note(request, traveller_history_rows or [])
    request_summary = _request_summary(request)
    notes = [
        "No live booking APIs were used; prices are deterministic planning estimates.",
        "Visa readiness is only verified when a matching provided visa rule exists.",
    ]
    if history_note:
        notes.append(history_note)
    if missing:
        approval_status = "Missing Info"
    elif budget_check.approval_required:
        approval_status = "Waiting for Approval"
    else:
        approval_status = "Plan Generated"
    base_plan = CorporateTravelPlan(
        request_summary=request_summary,
        missing_information=missing,
        travel_readiness=readiness,
        budget_policy_check=budget_check,
        travel_options=options,
        agent_note=_agent_note(readiness, budget_check, missing),
        agent_notes=notes,
        customer_message_draft=_customer_message(request, readiness, budget_check),
        customer_itinerary_draft=_customer_itinerary(request, options[0], nights),
        approval_status=approval_status,
    )
    return _enhance_corporate_plan_with_llm(base_plan, request, policy_rows or [], traveller_history_rows or [], visa_rule_rows or [])


def _corporate_missing_information(request: CorporateTravelRequest) -> list[str]:
    missing: list[str] = []
    traveller = request.traveller_details
    travel = request.travel_details
    budgets = request.budgets
    if not traveller.traveler_name:
        missing.append("traveller_details.traveler_name")
    if not traveller.traveler_email:
        missing.append("traveller_details.traveler_email")
    if not traveller.nationality:
        missing.append("traveller_details.nationality")
    if not traveller.passport_expiry:
        missing.append("traveller_details.passport_expiry")
    if not travel.origin:
        missing.append("travel_details.origin")
    if not travel.destination:
        missing.append("travel_details.destination")
    if not travel.destination_country:
        missing.append("travel_details.destination_country")
    if not travel.depart_date:
        missing.append("travel_details.depart_date")
    if not travel.return_date:
        missing.append("travel_details.return_date")
    if not budgets.total_budget:
        missing.append("budgets.total_budget")
    return missing


def _enhance_corporate_plan_with_llm(
    base_plan: CorporateTravelPlan,
    request: CorporateTravelRequest,
    policy_rows: list[dict[str, object]],
    traveller_history_rows: list[dict[str, object]],
    visa_rule_rows: list[dict[str, object]],
) -> CorporateTravelPlan:
    if not _llm_ready():
        return base_plan
    try:
        payload = {
            "request": request.model_dump(mode="json"),
            "company_policy": policy_rows,
            "traveller_history": traveller_history_rows,
            "visa_rules": visa_rule_rows,
            "validated_base_plan": base_plan.model_dump(mode="json"),
            "required_json_shape": {
                "request_summary": "string",
                "missing_information": [],
                "travel_readiness": {
                    "passport_status": "Ready | Needs Review | Blocking Issue",
                    "visa_status": "Ready | Needs Review | Blocking Issue",
                    "transit_warning": "string",
                    "document_notes": [],
                },
                "budget_policy_check": {
                    "budget_status": "Within Budget | Needs Approval | Out of Budget | Needs Review",
                    "policy_status": "Compliant | Needs Approval | Policy Violation | Needs Review",
                    "approval_required": True,
                    "approval_reason": "string",
                    "total_budget": 0,
                    "estimated_cost": 0,
                },
                "travel_options": [
                    {
                        "option_name": "Best within budget",
                        "flight_summary": "string",
                        "hotel_summary": "string",
                        "estimated_cost": 0,
                        "pros": [],
                        "cons": [],
                        "policy_status": "string",
                        "recommendation_reason": "string",
                    }
                ],
                "agent_note": "string",
                "agent_notes": [],
                "customer_message_draft": "string",
                "customer_itinerary_draft": "string",
                "approval_status": "Plan Generated",
            },
        }
        text = _chat_completion(
            [
                {
                    "role": "system",
                    "content": (
                        "You are an AI assistant for a corporate travel company. Return strict json only. "
                        "Improve the customer-facing summary, travel options, agent notes, customer message, "
                        "and itinerary draft from the validated base plan. Do not invent passport, visa, budget, "
                        "policy, price, or approval facts. Visa/passport conclusions must remain review-oriented "
                        "unless verified by supplied rule data. Do not create bookings or payment instructions."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, default=str)},
            ],
            max_tokens=1800,
            json_response=True,
        )
        llm_plan = CorporateTravelPlan.model_validate(json.loads(_extract_json_object(text)))
        safe_options = []
        for index, option in enumerate(llm_plan.travel_options):
            base_option = base_plan.travel_options[index] if index < len(base_plan.travel_options) else option
            safe_options.append(
                option.model_copy(
                    update={
                        "option_name": base_option.option_name,
                        "estimated_cost": base_option.estimated_cost,
                        "policy_status": base_option.policy_status,
                    }
                )
            )
        return llm_plan.model_copy(
            update={
                "missing_information": base_plan.missing_information,
                "travel_readiness": base_plan.travel_readiness,
                "budget_policy_check": base_plan.budget_policy_check,
                "travel_options": safe_options,
                "approval_status": base_plan.approval_status,
                "agent_notes": [*llm_plan.agent_notes, f"{_llm_provider_name()} generated the narrative draft; deterministic rules kept document, budget, policy, and approval statuses."],
            }
        )
    except Exception as exc:
        return base_plan.model_copy(
            update={
                "agent_notes": [
                    *base_plan.agent_notes,
                    f"{_llm_provider_name()} planning enhancement unavailable: {type(exc).__name__}. Deterministic MVP plan shown for agent review.",
                ]
            }
        )


def _request_summary(request: CorporateTravelRequest) -> str:
    traveller = request.traveller_details.traveler_name or "Traveller"
    origin = request.travel_details.origin or "origin pending"
    destination = request.travel_details.destination or "destination pending"
    depart = request.travel_details.depart_date.isoformat() if request.travel_details.depart_date else "date pending"
    ret = request.travel_details.return_date.isoformat() if request.travel_details.return_date else "return pending"
    purpose = request.travel_details.trip_purpose or "business travel"
    return f"{traveller} needs {purpose} travel from {origin} to {destination}, departing {depart} and returning {ret}."


def _corporate_nights(request: CorporateTravelRequest) -> int:
    depart = request.travel_details.depart_date
    ret = request.travel_details.return_date
    if not depart or not ret:
        return 2
    return max(1, (ret - depart).days)


def _corporate_options(request: CorporateTravelRequest, nights: int) -> list[TravelOption]:
    flight_base = _corporate_flight_estimate(request)
    hotel_base = _corporate_hotel_estimate(request, nights)
    cabin = request.travel_details.cabin.replace("_", " ")
    destination = request.travel_details.destination or "destination"
    airline = request.preferences.preferred_airline or "major carrier"
    hotel = request.preferences.hotel_preference or "business hotel"
    best_cost = int(flight_base * 0.92 + hotel_base)
    fastest_cost = int(flight_base * 1.12 + hotel_base * 1.05)
    comfort_cost = int(flight_base * 1.3 + hotel_base * 1.18)
    return [
        TravelOption(
            option_name="Best within budget",
            flight_summary=f"Round-trip {cabin} routing to {destination} on a cost-controlled {airline} option.",
            hotel_summary=f"{hotel} for {nights} night(s) with standard business amenities.",
            estimated_cost=best_cost,
            pros=["Lowest estimated total", "Balanced schedule", "Best first option for budget review"],
            cons=["May include one connection", "Seat and fare class need confirmation before ticketing"],
            policy_status="Compliant pending document review",
            recommendation_reason="Best balance of cost, schedule, and corporate policy.",
        ),
        TravelOption(
            option_name="Fastest route",
            flight_summary=f"Fastest practical {cabin} routing to {destination} with fewer or shorter connections.",
            hotel_summary=f"{hotel} close to the primary business area.",
            estimated_cost=fastest_cost,
            pros=["Shortest travel time", "Lower disruption risk"],
            cons=["Higher fare estimate", "May need approval if above budget"],
            policy_status="Needs budget check",
            recommendation_reason="Use when schedule certainty matters more than lowest fare.",
        ),
        TravelOption(
            option_name="Comfort-focused option",
            flight_summary=f"Comfort-optimized {cabin} routing with better connection buffers.",
            hotel_summary=f"Upgraded {hotel} option with stronger rest and work amenities.",
            estimated_cost=comfort_cost,
            pros=["Better rest profile", "More flexible planning buffers"],
            cons=["Highest estimated cost", "Most likely to require approval"],
            policy_status="Needs approval review",
            recommendation_reason="Use for senior traveler, long-haul fatigue, or high-stakes meeting schedules.",
        ),
    ]


def _corporate_flight_estimate(request: CorporateTravelRequest) -> int:
    cabin_multiplier = {"economy": 1.0, "premium_economy": 1.35, "business": 2.4, "first": 3.5}[request.travel_details.cabin]
    origin = (request.travel_details.origin or "").lower()
    destination = (request.travel_details.destination or "").lower()
    country = (request.travel_details.destination_country or "").lower()
    long_haul = any(marker in f"{origin} {destination} {country}" for marker in ("johannesburg", "south africa", "tokyo", "london", "san francisco", "new york"))
    base = 1350 if long_haul else 650
    return int(base * cabin_multiplier * request.travel_details.travelers)


def _corporate_hotel_estimate(request: CorporateTravelRequest, nights: int) -> int:
    destination = (request.travel_details.destination or "").lower()
    country = (request.travel_details.destination_country or "").lower()
    nightly = 185 if "johannesburg" in destination or "south africa" in country else 160
    return nightly * nights


def _travel_readiness(request: CorporateTravelRequest, visa_rules: list[dict[str, object]]) -> TravelReadiness:
    ret = request.travel_details.return_date
    passport_expiry = request.traveller_details.passport_expiry
    notes: list[str] = []
    if not ret:
        passport_status = "Needs Review"
        notes.append("Return date is required before passport validity can be checked.")
    elif not passport_expiry:
        passport_status = "Needs Review"
        notes.append("Passport expiry was not provided.")
    elif passport_expiry < ret:
        passport_status = "Blocking Issue"
        notes.append("Passport expires before the return date.")
    elif passport_expiry < ret + timedelta(days=180):
        passport_status = "Needs Review"
        notes.append("Passport validity is less than six months after return.")
    else:
        passport_status = "Ready"
        notes.append("Passport validity is at least six months after return.")

    visa_status, visa_note = _visa_status(request, visa_rules)
    notes.append(visa_note)
    return TravelReadiness(
        passport_status=passport_status,
        visa_status=visa_status,
        transit_warning="Transit requirements were not verified and need review before ticketing.",
        document_notes=notes,
    )


def _visa_status(request: CorporateTravelRequest, visa_rules: list[dict[str, object]]) -> tuple[str, str]:
    ret = request.travel_details.return_date
    matching_rule = _matching_visa_rule(request, visa_rules)
    visa_expiry = request.traveller_details.visa_expiry
    provided_status = (request.traveller_details.visa_status or "").strip()
    if matching_rule and _truthy(matching_rule.get("visa_required")):
        if not provided_status and not visa_expiry:
            return "Blocking Issue", "A matching visa rule says a visa is required, but visa information was not provided."
        if ret and visa_expiry and visa_expiry < ret:
            return "Blocking Issue", "Visa expires before the return date."
        return "Ready", "A matching provided visa rule requires a visa and provided visa details are not expired before return."
    if matching_rule and not _truthy(matching_rule.get("visa_required")):
        return "Verified Not Required", "A matching provided visa rule says a visa is not required."
    if ret and visa_expiry and visa_expiry < ret:
        return "Blocking Issue", "Visa expiry is before return date, but no matching visa rule verified the trip."
    return "Needs Review", "Visa requirement needs review because no matching provided visa rule verified the route."


def _matching_visa_rule(request: CorporateTravelRequest, visa_rules: list[dict[str, object]]) -> dict[str, object] | None:
    nationality = _norm(request.traveller_details.nationality)
    destination_country = _norm(request.travel_details.destination_country)
    for rule in visa_rules:
        rule_from = _norm(rule.get("from_country") or rule.get("nationality") or rule.get("citizenship"))
        rule_to = _norm(rule.get("destination_country") or rule.get("to_country") or rule.get("country"))
        if rule_from == nationality and rule_to == destination_country:
            return rule
    return None


def _budget_policy_check(
    request: CorporateTravelRequest,
    estimated_cost: int,
    policy_rows: list[dict[str, object]],
    options: list[TravelOption],
) -> BudgetPolicyCheck:
    total_budget = request.budgets.total_budget
    if not total_budget:
        budget_status = "Needs Review"
    elif estimated_cost <= total_budget:
        budget_status = "Within Budget"
    elif estimated_cost <= int(total_budget * 1.1):
        budget_status = "Needs Approval"
    else:
        budget_status = "Out of Budget"

    policy_violations = _policy_violations(request, estimated_cost, policy_rows)
    if policy_violations:
        policy_status = "Policy Violation"
    elif budget_status in {"Needs Approval", "Out of Budget"}:
        policy_status = "Needs Approval"
    else:
        policy_status = "Compliant"
    for option in options:
        option.policy_status = policy_status
    approval_required = budget_status in {"Needs Approval", "Out of Budget"} or bool(policy_violations)
    reasons = []
    if budget_status == "Needs Approval":
        reasons.append("Estimated cost is within 10% above budget.")
    elif budget_status == "Out of Budget":
        reasons.append("Estimated cost is more than 10% above budget.")
    reasons.extend(policy_violations)
    return BudgetPolicyCheck(
        budget_status=budget_status,
        policy_status=policy_status,
        approval_required=approval_required,
        approval_reason=" ".join(reasons) if reasons else "No approval required based on available budget and policy data.",
        total_budget=total_budget,
        estimated_cost=estimated_cost,
    )


def _policy_violations(request: CorporateTravelRequest, estimated_cost: int, policy_rows: list[dict[str, object]]) -> list[str]:
    violations: list[str] = []
    cabin = request.travel_details.cabin
    for row in policy_rows:
        allowed = row.get("allowed_cabins") or row.get("allowed_cabin") or row.get("cabin")
        if allowed:
            allowed_values = {_norm(item) for item in str(allowed).replace(";", ",").split(",") if item.strip()}
            if allowed_values and _norm(cabin) not in allowed_values:
                violations.append(f"Requested cabin {cabin.replace('_', ' ')} is outside provided company policy.")
        max_budget = _money_int(row.get("max_budget") or row.get("max_total_budget") or row.get("budget_limit"))
        if max_budget and estimated_cost > max_budget:
            violations.append("Estimated cost exceeds provided company policy budget limit.")
    return violations


def _agent_note(readiness: TravelReadiness, budget_check: BudgetPolicyCheck, missing: list[str]) -> str:
    if missing:
        return "Collect missing request information before moving to approval or ticketing."
    if readiness.passport_status == "Blocking Issue" or readiness.visa_status == "Blocking Issue":
        return "Resolve blocking document issues before planning can be finalized."
    if budget_check.approval_required:
        return "Route this request for approval before finalizing the itinerary."
    return "Plan is ready for customer review and itinerary finalization."


def _customer_message(request: CorporateTravelRequest, readiness: TravelReadiness, budget_check: BudgetPolicyCheck) -> str:
    name = request.traveller_details.traveler_name or "there"
    return (
        f"Hi {name}, I prepared three planning options for your trip. "
        f"Document readiness is {readiness.passport_status}/{readiness.visa_status}, "
        f"and the budget check is {budget_check.budget_status}."
    )


def _customer_itinerary(request: CorporateTravelRequest, option: TravelOption, nights: int) -> str:
    origin = request.travel_details.origin or "origin pending"
    destination = request.travel_details.destination or "destination pending"
    depart = request.travel_details.depart_date.isoformat() if request.travel_details.depart_date else "date pending"
    ret = request.travel_details.return_date.isoformat() if request.travel_details.return_date else "return pending"
    return (
        f"{option.option_name}: depart {origin} on {depart}, stay in {destination} for {nights} night(s), "
        f"and return on {ret}. Estimated total: ${option.estimated_cost}."
    )


def _history_note(request: CorporateTravelRequest, rows: list[dict[str, object]]) -> str:
    email = _norm(request.traveller_details.traveler_email)
    employee_id = _norm(request.traveller_details.employee_id)
    for row in rows:
        if _norm(row.get("traveler_email") or row.get("email")) == email or _norm(row.get("employee_id")) == employee_id:
            preference = row.get("preferred_airline") or row.get("hotel_preference") or row.get("notes")
            if preference:
                return f"Traveller history note: {preference}."
    return ""


def _truthy(value: object) -> bool:
    return str(value).strip().lower() in {"true", "yes", "y", "1", "required"}


def _norm(value: object) -> str:
    return str(value or "").strip().lower().replace("_", " ")


def _live_provider_offers(request: TravelRequest, actor_id: str) -> tuple[list[Offer], list[Offer], list[AuditEvent]]:
    events: list[AuditEvent] = []
    flights: list[Offer] = []
    hotels: list[Offer] = []

    if os.getenv("DUFFEL_API_TOKEN"):
        provider_flights, event = _duffel_api_offers(request, actor_id)
        flights = provider_flights
        events.append(event)

    if os.getenv("BOOKING_COM_TOKEN") and os.getenv("BOOKING_COM_AFFILIATE_ID"):
        provider_hotels, event = _booking_api_hotels(request, actor_id)
        hotels = provider_hotels
        events.append(event)
    elif os.getenv("RAPIDAPI_BOOKING_KEY"):
        provider_hotels, event = _rapidapi_booking_hotels(request, actor_id)
        hotels = provider_hotels
        events.append(event)

    if flights and hotels:
        return flights, hotels, events

    mcp_flights, mcp_hotels, mcp_events = _live_mcp_offers(request, actor_id)
    return flights or mcp_flights, hotels or mcp_hotels, [*events, *mcp_events]


def _duffel_api_offers(request: TravelRequest, actor_id: str) -> tuple[list[Offer], AuditEvent]:
    import httpx

    try:
        base_url = (os.getenv("DUFFEL_API_BASE_URL") or "https://api.duffel.com").rstrip("/")
        slices = [
            {
                "origin": _resolve_iata(request.origin, os.getenv("TRAVEL_AI_MCP_TOOLS_URL", "http://127.0.0.1:8083/tools").rstrip("/")),
                "destination": _resolve_iata(request.destination, os.getenv("TRAVEL_AI_MCP_TOOLS_URL", "http://127.0.0.1:8083/tools").rstrip("/")),
                "departure_date": request.depart_date.isoformat(),
            }
        ]
        if request.return_date:
            slices.append({"origin": slices[0]["destination"], "destination": slices[0]["origin"], "departure_date": request.return_date.isoformat()})
        supplier_timeout = _int_or_none(os.getenv("DUFFEL_SUPPLIER_TIMEOUT_MS")) or 10000
        response = httpx.post(
            f"{base_url}/air/offer_requests",
            params={"return_offers": True, "supplier_timeout": supplier_timeout},
            headers={
                "Accept-Encoding": "gzip",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Duffel-Version": os.getenv("DUFFEL_VERSION", "v2"),
                "Authorization": f"Bearer {os.environ['DUFFEL_API_TOKEN']}",
            },
            json={
                "data": {
                    "slices": slices,
                    "passengers": [{"type": "adult"} for _ in range(request.travelers)],
                    "cabin_class": request.cabin,
                    "max_connections": _int_or_none(os.getenv("DUFFEL_MAX_CONNECTIONS", "1")),
                }
            },
            timeout=45.0,
        )
        response.raise_for_status()
        offers = _map_duffel_offers(response.json(), request)
        return offers, AuditEvent(actor_id=actor_id or None, event_type="duffel.api.search", message=f"Duffel API returned {len(offers)} priced flight offer(s).")
    except Exception as exc:
        return [], AuditEvent(
            actor_id=actor_id or None,
            event_type="duffel.api.unavailable",
            message=f"Duffel API search unavailable: {type(exc).__name__}.",
            decision="record",
        )


def _booking_api_hotels(request: TravelRequest, actor_id: str) -> tuple[list[Offer], AuditEvent]:
    import httpx

    try:
        city_id = _booking_city_id(request)
        if city_id is None:
            raise RuntimeError("Booking.com city identifier was not resolved")
        base_url = (os.getenv("BOOKING_COM_API_BASE_URL") or "https://demandapi.booking.com/3.1").rstrip("/")
        body = {
            "booker": {
                "country": (os.getenv("BOOKING_COM_BOOKER_COUNTRY") or "in").lower(),
                "platform": os.getenv("BOOKING_COM_PLATFORM") or "desktop",
                "travel_purpose": "business",
            },
            "checkin": request.depart_date.isoformat(),
            "checkout": (request.return_date or request.depart_date).isoformat(),
            "city": city_id,
            "currency": os.getenv("BOOKING_COM_CURRENCY") or "USD",
            "extras": ["extra_charges", "products"],
            "guests": {"number_of_adults": request.travelers, "number_of_rooms": 1},
            "rows": 10,
        }
        response = httpx.post(
            f"{base_url}/accommodations/search",
            headers=_booking_headers(),
            json=body,
            timeout=45.0,
        )
        response.raise_for_status()
        hotels = _map_booking_hotels(response.json())
        return hotels, AuditEvent(actor_id=actor_id or None, event_type="booking.api.search", message=f"Booking.com Demand API returned {len(hotels)} hotel offer(s).")
    except Exception as exc:
        return [], AuditEvent(
            actor_id=actor_id or None,
            event_type="booking.api.unavailable",
            message=f"Booking.com Demand API search unavailable: {type(exc).__name__}.",
            decision="record",
        )


def _rapidapi_booking_hotels(request: TravelRequest, actor_id: str) -> tuple[list[Offer], AuditEvent]:
    import httpx

    try:
        base_url = (os.getenv("RAPIDAPI_BOOKING_BASE_URL") or "https://booking-com.p.rapidapi.com/v1/hotels").rstrip("/")
        locale = os.getenv("BOOKING_LOCALE") or "en-gb"
        currency = os.getenv("BOOKING_CURRENCY") or "USD"
        city = _city_name_for_hotel_search(request.destination)
        headers = {
            "x-rapidapi-key": os.environ["RAPIDAPI_BOOKING_KEY"],
            "x-rapidapi-host": os.getenv("RAPIDAPI_BOOKING_HOST") or "booking-com.p.rapidapi.com",
        }
        locations = httpx.get(f"{base_url}/locations", params={"name": city.lower(), "locale": locale}, headers=headers, timeout=30.0)
        locations.raise_for_status()
        destination = _rapidapi_booking_destination(locations.json())
        if not destination:
            raise RuntimeError("Booking.com RapidAPI destination was not resolved")
        checkout = (request.return_date or request.depart_date).isoformat()
        search = httpx.get(
            f"{base_url}/search",
            params={
                "checkout_date": checkout,
                "order_by": "popularity",
                "filter_by_currency": currency,
                "room_number": "1",
                "dest_id": str(destination["dest_id"]),
                "dest_type": str(destination["dest_type"]),
                "adults_number": str(request.travelers),
                "checkin_date": request.depart_date.isoformat(),
                "units": "metric",
                "locale": locale,
                "page_number": "0",
                "include_adjacency": "true",
            },
            headers=headers,
            timeout=45.0,
        )
        search.raise_for_status()
        hotels = _map_rapidapi_booking_hotels(search.json().get("result", []), request)
        return hotels, AuditEvent(actor_id=actor_id or None, event_type="booking.rapidapi.search", message=f"Booking.com RapidAPI returned {len(hotels)} hotel offer(s).")
    except Exception as exc:
        return [], AuditEvent(
            actor_id=actor_id or None,
            event_type="booking.rapidapi.unavailable",
            message=f"Booking.com RapidAPI search unavailable: {type(exc).__name__}.",
            decision="record",
        )


def _live_mcp_offers(request: TravelRequest, actor_id: str) -> tuple[list[Offer], list[Offer], list[AuditEvent]]:
    base_url = os.getenv("TRAVEL_AI_MCP_TOOLS_URL", "http://127.0.0.1:8083/tools").rstrip("/")
    events: list[AuditEvent] = []
    try:
        origin = _resolve_iata(request.origin, base_url)
        destination = _resolve_iata(request.destination, base_url)
        flight_raw = _call_mcp_tool(
            base_url,
            "search_flights",
            {
                "origin": origin,
                "destination": destination,
                "departure_date": request.depart_date.isoformat(),
                "return_date": request.return_date.isoformat() if request.return_date else None,
                "passengers": request.travelers,
                "cabin_class": request.cabin,
                "max_price_usd": request.budget_usd,
            },
        )
        hotel_raw = _call_mcp_tool(
            base_url,
            "search_hotels",
            {
                "destination_iata": destination,
                "check_in_date": request.depart_date.isoformat(),
                "check_out_date": (request.return_date or request.depart_date).isoformat(),
                "rooms": 1,
                "guests": request.travelers,
                "max_price_usd": request.budget_usd,
            },
        )
        flights = _map_flight_offers(flight_raw, request)
        hotels = _map_hotel_offers(hotel_raw)
        events.extend([
            AuditEvent(actor_id=actor_id or None, event_type="mcp.duffel.search", message=f"Duffel MCP returned {len(flights)} priced flight offer(s)."),
            AuditEvent(actor_id=actor_id or None, event_type="mcp.booking.search", message=f"Booking.com MCP returned {len(hotels)} priced hotel offer(s)."),
        ])
        return flights, hotels, events
    except Exception as exc:
        return [], [], [
            AuditEvent(
                actor_id=actor_id or None,
                event_type="mcp.live_search.unavailable",
                message=f"Live provider search unavailable: {type(exc).__name__}.",
                decision="record",
            )
        ]


def _llm_ready() -> bool:
    return _deepseek_ready() or _openrouter_ready()


def _deepseek_ready() -> bool:
    return bool(os.getenv("DEEPSEEK_API_KEY") and _deepseek_model())


def _openrouter_ready() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY") and _openrouter_model())


def chat_with_travel_ai(request: ChatRequest, context: AuthContext, purpose: str) -> ChatResponse:
    if not _llm_ready():
        raise RuntimeError("Travel AI model is not configured.")

    messages = [
        {
            "role": "system",
            "content": (
                "You are Unipro Travel, a corporate travel companion. Respond like a helpful colleague: "
                "warm, concise, practical, and policy-aware. Help with flights, hotels, visa readiness, "
                "budget, saved preferences, approvals, and audit expectations. Do not claim bookings are final. "
                "If the user asks to save something, explain what would be saved as a preference and what remains in the audit trail."
            ),
        },
        {
            "role": "system",
            "content": (
                f"Traveler: {context.email}; role: {context.role}; department: {context.department}; "
                f"authorized purpose: {purpose}."
            ),
        },
    ]
    if request.trip:
        trip = request.trip
        flight = trip.flight_offers[0].title if trip.flight_offers else "not selected"
        hotel = trip.hotel_offers[0].title if trip.hotel_offers else "not selected"
        messages.append(
            {
                "role": "system",
                "content": (
                    "Current trip context: "
                    f"{trip.request.origin} to {trip.request.destination}, "
                    f"{trip.request.depart_date} to {trip.request.return_date or trip.request.depart_date}, "
                    f"risk {trip.risk}, flight {flight}, hotel {hotel}, "
                    f"budget {trip.request.budget_usd or 'not supplied'} USD."
                ),
            }
        )

    for item in request.history[-10:]:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": request.message})

    text = _chat_completion(messages, max_tokens=450)

    return ChatResponse(
        message=text,
        model=_llm_model_name(),
        audit_events=[
            AuditEvent(
                trip_id=request.trip.id if request.trip else None,
                actor_id=context.user_id,
                event_type="agent.chat.completed",
                message=f"Travel assistant generated a {_llm_provider_name()} model response.",
                purpose=purpose,
                decision="allow",
            )
        ],
    )


def _chat_completion(messages: list[dict[str, str]], max_tokens: int, json_response: bool = False) -> str:
    import httpx

    if _deepseek_ready():
        model = _deepseek_model()
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if json_response:
            body["response_format"] = {"type": "json_object"}
        response = httpx.post(
            f"{_deepseek_base_url()}/chat/completions",
            headers={
                "Authorization": f"Bearer {os.environ['DEEPSEEK_API_KEY']}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=75.0,
        )
    else:
        model = _openrouter_model()
        body = {
            "model": _strip_openrouter_prefix(model),
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if json_response:
            body["response_format"] = {"type": "json_object"}
        provider = _provider_pref()
        if provider:
            body["provider"] = provider
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
                "Content-Type": "application/json",
                "X-OpenRouter-Title": "Unipro Travel AI",
            },
            json=body,
            timeout=75.0,
        )
    response.raise_for_status()
    payload = response.json()
    text = (payload["choices"][0]["message"]["content"] or "").strip()
    if not text:
        raise RuntimeError("Travel AI returned an empty response.")
    return text


def _deepseek_base_url() -> str:
    return (os.getenv("DEEPSEEK_API_BASE_URL") or "https://api.deepseek.com").rstrip("/")


def _deepseek_model() -> str:
    return os.getenv("DEEPSEEK_CHAT_MODEL") or os.getenv("DEEPSEEK_MODEL") or "deepseek-v4-flash"


def _llm_model_name() -> str:
    return _deepseek_model() if _deepseek_ready() else _openrouter_model()


def _llm_provider_name() -> str:
    return "DeepSeek" if _deepseek_ready() else "OpenRouter"


def _openrouter_model() -> str:
    configured = os.getenv("OPENROUTER_CHAT_MODEL") or os.getenv("OPENROUTER_FLASH_MODEL")
    if configured:
        return configured
    default_model = os.getenv("MODEL") or ""
    if "flash" in default_model.lower():
        return default_model
    return "deepseek/deepseek-v4-flash"


def _strip_openrouter_prefix(model: str) -> str:
    return model[len("openrouter/"):] if model.lower().startswith("openrouter/") else model


def _provider_pref() -> dict[str, object]:
    order = [item.strip() for item in (os.getenv("OPENROUTER_PROVIDER_ORDER") or "DeepSeek").split(",") if item.strip()]
    return {"order": order, "allow_fallbacks": False} if order else {}


CITY_IATA = {
    "hyderabad": "HYD",
    "johannesburg": "JNB",
    "san francisco": "SFO",
    "sfo": "SFO",
    "new york": "JFK",
    "london": "LHR",
    "mumbai": "BOM",
    "berlin": "BER",
}

IATA_CITY_NAMES = {
    "HYD": "Hyderabad",
    "JNB": "Johannesburg",
    "SFO": "San Francisco",
    "JFK": "New York",
    "LHR": "London",
    "BOM": "Mumbai",
    "BER": "Berlin",
}


COUNTRY_CODES = {
    "india": "in",
    "south africa": "za",
    "united states": "us",
    "usa": "us",
    "united kingdom": "gb",
    "uk": "gb",
    "germany": "de",
    "japan": "jp",
}


def _booking_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {os.environ['BOOKING_COM_TOKEN']}",
        "Content-Type": "application/json",
        "X-Affiliate-Id": os.environ["BOOKING_COM_AFFILIATE_ID"],
    }


def _booking_city_id(request: TravelRequest) -> int | None:
    configured = _booking_city_id_from_env(request.destination)
    if configured is not None:
        return configured

    import httpx

    base_url = (os.getenv("BOOKING_COM_API_BASE_URL") or "https://demandapi.booking.com/3.1").rstrip("/")
    country = COUNTRY_CODES.get(_norm(request.destination)) or COUNTRY_CODES.get(_norm(request.destination.split(",")[-1]))
    response = httpx.post(
        f"{base_url}/common/locations/cities",
        headers=_booking_headers(),
        json={"country": country, "languages": ["en-gb"], "rows": 1000} if country else {"languages": ["en-gb"], "rows": 1000},
        timeout=30.0,
    )
    response.raise_for_status()
    destination = _norm(request.destination.split(",")[0])
    for city in response.json().get("data", []):
        name = _norm(city.get("name") or city.get("city_name") or city.get("label"))
        if name == destination or destination in name:
            return _int_or_none(city.get("id") or city.get("city"))
    return None


def _booking_city_id_from_env(destination: str) -> int | None:
    raw = os.getenv("BOOKING_COM_CITY_IDS")
    if not raw:
        return None
    try:
        configured = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(configured, dict):
        return None
    for key in {destination, destination.split(",")[0], _norm(destination), _norm(destination.split(",")[0])}:
        value = configured.get(key)
        if value is not None:
            return _int_or_none(value)
    return None


def _map_duffel_offers(payload: Any, request: TravelRequest) -> list[Offer]:
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    raw_offers = data.get("offers") if isinstance(data, dict) else None
    if not isinstance(raw_offers, list):
        return []
    mapped: list[Offer] = []
    for offer in raw_offers[:4]:
        if not isinstance(offer, dict):
            continue
        price = _money_int(offer.get("total_amount") or offer.get("base_amount"))
        if price <= 0:
            continue
        owner = offer.get("owner") if isinstance(offer.get("owner"), dict) else {}
        airline = str(owner.get("name") or "Duffel flight option").strip()
        legs = _duffel_flight_legs(offer, request, airline)
        notes = [
            item for item in [
                f"Offer ID: {offer.get('id')}" if offer.get("id") else "",
                f"Expires at: {offer.get('expires_at')}" if offer.get("expires_at") else "",
                "Source: Duffel API live search",
                "Review fare rules, baggage, and payment requirements before ticketing.",
            ] if item
        ]
        mapped.append(
            Offer(
                kind="flight",
                title=f"{airline} · {request.origin.upper()} -> {request.destination}",
                provider=f"duffel-api/{str(owner.get('iata_code') or owner.get('id') or 'live').lower()}",
                price_usd=price,
                currency=str(offer.get("total_currency") or "USD"),
                refundable=bool(offer.get("conditions", {}).get("refund_before_departure", {}).get("allowed") if isinstance(offer.get("conditions"), dict) else False),
                notes=notes,
                flight_legs=legs or _fallback_flight_legs(request),
            )
        )
    return mapped


def _duffel_flight_legs(offer: dict[str, Any], request: TravelRequest, airline: str) -> list[FlightLeg]:
    legs: list[FlightLeg] = []
    slices = offer.get("slices")
    if not isinstance(slices, list):
        return legs
    for index, slice_item in enumerate(slices[:2]):
        if not isinstance(slice_item, dict):
            continue
        segments = slice_item.get("segments")
        first_segment = segments[0] if isinstance(segments, list) and segments else {}
        last_segment = segments[-1] if isinstance(segments, list) and segments else {}
        origin = first_segment.get("origin") if isinstance(first_segment.get("origin"), dict) else {}
        destination = last_segment.get("destination") if isinstance(last_segment.get("destination"), dict) else {}
        marketing_carrier = first_segment.get("marketing_carrier") if isinstance(first_segment.get("marketing_carrier"), dict) else {}
        legs.append(
            FlightLeg(
                direction="return" if index == 1 else "outbound",
                origin=str(origin.get("iata_code") or (request.destination if index == 1 else request.origin)).strip(),
                destination=str(destination.get("iata_code") or (request.origin if index == 1 else request.destination)).strip(),
                departure_at=_string_or_none(first_segment.get("departing_at") or slice_item.get("departing_at")),
                arrival_at=_string_or_none(last_segment.get("arriving_at") or slice_item.get("arriving_at")),
                stops=max(0, len(segments) - 1) if isinstance(segments, list) else None,
                airline=str(marketing_carrier.get("name") or airline).strip(),
            )
        )
    return legs


def _map_booking_hotels(payload: Any) -> list[Offer]:
    raw_hotels = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(raw_hotels, list):
        return []
    mapped: list[Offer] = []
    for hotel in raw_hotels[:4]:
        if not isinstance(hotel, dict):
            continue
        price = _booking_price(hotel)
        if price <= 0:
            continue
        mapped.append(
            Offer(
                kind="hotel",
                title=str(hotel.get("name") or hotel.get("accommodation_name") or "Booking.com hotel option").strip(),
                provider="booking.com-demand-api",
                price_usd=price,
                currency=str(hotel.get("currency") or _nested_get(hotel, ["price", "currency"]) or "USD"),
                refundable=_booking_refundable(hotel),
                notes=[
                    item for item in [
                        str(hotel.get("address") or _nested_get(hotel, ["location", "address"]) or "").strip(),
                        f"Accommodation ID: {hotel.get('id') or hotel.get('accommodation')}" if hotel.get("id") or hotel.get("accommodation") else "",
                        "Source: Booking.com Demand API live search",
                        "Availability and cancellation terms must be reviewed before customer confirmation.",
                    ] if item
                ],
            )
        )
    return mapped


def _rapidapi_booking_destination(locations: Any) -> dict[str, Any] | None:
    if not isinstance(locations, list):
        return None
    for item in locations:
        if isinstance(item, dict) and item.get("dest_type") == "city" and item.get("dest_id"):
            return item
    for item in locations:
        if isinstance(item, dict) and item.get("dest_id"):
            return item
    return None


def _map_rapidapi_booking_hotels(raw_hotels: Any, request: TravelRequest) -> list[Offer]:
    if not isinstance(raw_hotels, list):
        return []
    nights = _nights(request)
    mapped: list[Offer] = []
    for hotel in raw_hotels[:10]:
        if not isinstance(hotel, dict):
            continue
        hotel_id = hotel.get("hotel_id") or hotel.get("id")
        name = hotel.get("hotel_name") or hotel.get("hotel_name_trans") or hotel.get("name")
        price = _rapidapi_booking_price(hotel)
        if not hotel_id or not name or price <= 0:
            continue
        currency = _rapidapi_booking_currency(hotel)
        if request.budget_usd is not None and currency == "USD" and price > request.budget_usd:
            continue
        mapped.append(
            Offer(
                kind="hotel",
                title=str(name).strip(),
                provider="booking.com-rapidapi",
                price_usd=price,
                currency=currency,
                refundable=True,
                notes=[
                    item for item in [
                        str(hotel.get("address") or hotel.get("address_trans") or hotel.get("city") or "").strip(),
                        f"{hotel.get('class')}-star" if hotel.get("class") is not None else "",
                        f"Review {hotel.get('review_score')}/10" if hotel.get("review_score") is not None else "",
                        f"${_money_int(price / nights)} / night",
                        "Source: Booking.com RapidAPI live search",
                        f"Booking link: {_rapidapi_booking_url(hotel, request)}" if _rapidapi_booking_url(hotel, request) else "",
                    ] if item
                ],
            )
        )
    mapped.sort(key=lambda offer: offer.price_usd)
    return mapped[:4]


def _rapidapi_booking_price(hotel: dict[str, Any]) -> int:
    composite = hotel.get("composite_price_breakdown") if isinstance(hotel.get("composite_price_breakdown"), dict) else {}
    for value in (
        _nested_get(composite, ["all_inclusive_amount", "value"]),
        _nested_get(composite, ["all_inclusive_amount_hotel_currency", "value"]),
        _nested_get(composite, ["gross_amount", "value"]),
        hotel.get("min_total_price"),
        hotel.get("price"),
    ):
        price = _money_int(value)
        if price > 0:
            return price
    return 0


def _rapidapi_booking_currency(hotel: dict[str, Any]) -> str:
    composite = hotel.get("composite_price_breakdown") if isinstance(hotel.get("composite_price_breakdown"), dict) else {}
    return str(
        _nested_get(composite, ["all_inclusive_amount", "currency"])
        or _nested_get(composite, ["all_inclusive_amount_hotel_currency", "currency"])
        or _nested_get(composite, ["gross_amount", "currency"])
        or hotel.get("currency_code")
        or "USD"
    )


def _rapidapi_booking_url(hotel: dict[str, Any], request: TravelRequest) -> str:
    raw = hotel.get("url") or hotel.get("hotel_url") or ""
    if not raw:
        return ""
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(str(raw))
    query = dict(parse_qsl(parts.query))
    query.update(
        {
            "checkin": request.depart_date.isoformat(),
            "checkout": (request.return_date or request.depart_date).isoformat(),
            "group_adults": str(request.travelers),
            "no_rooms": "1",
        }
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _booking_price(hotel: dict[str, Any]) -> int:
    candidates = [
        hotel.get("price"),
        _nested_get(hotel, ["price", "book"]),
        _nested_get(hotel, ["price", "total"]),
        _nested_get(hotel, ["products", 0, "price", "book"]),
        _nested_get(hotel, ["products", 0, "price", "total"]),
    ]
    for value in candidates:
        if isinstance(value, dict):
            value = value.get("amount") or value.get("value")
        price = _money_int(value)
        if price > 0:
            return price
    return 0


def _booking_refundable(hotel: dict[str, Any]) -> bool:
    products = hotel.get("products")
    first_product = products[0] if isinstance(products, list) and products else {}
    policies = first_product.get("policies") if isinstance(first_product, dict) else {}
    cancellation = policies.get("cancellation") if isinstance(policies, dict) else {}
    return bool(cancellation.get("free_cancellation_until")) if isinstance(cancellation, dict) else False


def _nested_get(value: Any, path: list[str | int]) -> Any:
    current = value
    for key in path:
        if isinstance(key, int):
            if not isinstance(current, list) or len(current) <= key:
                return None
            current = current[key]
        else:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
    return current


def _extract_json_object(text: str) -> str:
    clean = text.strip()
    if clean.startswith("```"):
        clean = clean.strip("`").strip()
        if clean.lower().startswith("json"):
            clean = clean[4:].strip()
    start = clean.find("{")
    end = clean.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in model output")
    return clean[start : end + 1]


def _city_name_for_hotel_search(value: str) -> str:
    clean = value.strip()
    if len(clean) == 3 and clean.isalpha():
        return IATA_CITY_NAMES.get(clean.upper(), clean.upper())
    return clean.split(",")[0].strip() or clean


def _call_mcp_tool(base_url: str, name: str, payload: dict[str, Any]) -> Any:
    import httpx

    clean_payload = {key: value for key, value in payload.items() if value is not None}
    response = httpx.post(f"{base_url}/{name}", json=clean_payload, timeout=35.0)
    response.raise_for_status()
    outer = response.json()
    text = outer.get("content", [{}])[0].get("text", "")
    if not text:
        return []
    import json

    parsed = json.loads(text)
    if isinstance(parsed, dict) and parsed.get("error"):
        raise RuntimeError(str(parsed["error"]))
    return parsed


def _resolve_iata(value: str, base_url: str) -> str:
    clean = value.strip()
    if len(clean) == 3 and clean.isalpha():
        return clean.upper()
    mapped = CITY_IATA.get(clean.lower())
    if mapped:
        return mapped
    results = _call_mcp_tool(base_url, "list_airports", {"keyword": clean})
    if isinstance(results, list) and results:
        code = str(results[0].get("iata_code") or "").strip()
        if len(code) == 3:
            return code.upper()
    raise RuntimeError(f"No IATA code found for {clean}")


def _map_flight_offers(raw: Any, request: TravelRequest) -> list[Offer]:
    if not isinstance(raw, list):
        return []
    mapped: list[Offer] = []
    for offer in raw[:4]:
        if not isinstance(offer, dict):
            continue
        price = _money_int(offer.get("price_usd"))
        if price <= 0:
            continue
        airline = str(offer.get("airline") or "Flight option").strip()
        origin = str(offer.get("origin") or request.origin).strip()
        destination = str(offer.get("destination") or request.destination).strip()
        flight_legs = _flight_legs_from_offer(offer, request, airline, origin, destination)
        notes = [
            item for item in [
                f"Depart {offer.get('departure_at')}" if offer.get("departure_at") else "",
                f"Arrive {offer.get('arrival_at')}" if offer.get("arrival_at") else "",
                f"Return depart {offer.get('return_departure_at')}" if offer.get("return_departure_at") else "",
                f"Return arrive {offer.get('return_arrival_at')}" if offer.get("return_arrival_at") else "",
                f"{offer.get('stops')} stop(s)" if offer.get("stops") is not None else "",
                f"Cabin: {offer.get('cabin_class') or request.cabin}",
                "Source: Duffel MCP live search",
                f"Booking link: {offer.get('booking_redirect_url')}" if offer.get("booking_redirect_url") else "",
            ] if item
        ]
        mapped.append(
            Offer(
                kind="flight",
                title=f"{airline} · {origin} -> {destination}",
                provider=f"duffel-mcp/{str(offer.get('airline_iata') or 'live').lower()}",
                price_usd=price,
                currency=str(offer.get("currency") or "USD"),
                refundable=bool(offer.get("refundable") or offer.get("policy_compliant")),
                notes=notes,
                flight_legs=flight_legs,
            )
        )
    return mapped


def _flight_legs_from_offer(offer: dict[str, Any], request: TravelRequest, airline: str, origin: str, destination: str) -> list[FlightLeg]:
    raw_legs = offer.get("legs")
    if isinstance(raw_legs, list):
        mapped = [_leg_from_raw_leg(leg, request, airline, index) for index, leg in enumerate(raw_legs) if isinstance(leg, dict)]
        return [leg for leg in mapped if leg]

    outbound = FlightLeg(
        direction="outbound",
        origin=origin,
        destination=destination,
        departure_at=_string_or_none(offer.get("departure_at")),
        arrival_at=_string_or_none(offer.get("arrival_at")),
        stops=_int_or_none(offer.get("stops")),
        airline=airline,
    )
    legs = [outbound]
    if request.return_date:
        return_origin = str(offer.get("return_origin") or offer.get("destination") or request.destination).strip()
        return_destination = str(offer.get("return_destination") or offer.get("origin") or request.origin).strip()
        legs.append(
            FlightLeg(
                direction="return",
                origin=return_origin,
                destination=return_destination,
                departure_at=_string_or_none(offer.get("return_departure_at")),
                arrival_at=_string_or_none(offer.get("return_arrival_at")),
                stops=_int_or_none(offer.get("return_stops", offer.get("stops"))),
                airline=str(offer.get("return_airline") or airline).strip(),
            )
        )
    return legs


def _leg_from_raw_leg(leg: dict[str, Any], request: TravelRequest, airline: str, index: int) -> FlightLeg | None:
    direction = str(leg.get("direction") or leg.get("type") or "").lower()
    if direction not in {"outbound", "return"}:
        direction = "return" if index == 1 else "outbound"
    origin = str(leg.get("origin") or (request.destination if direction == "return" else request.origin)).strip()
    destination = str(leg.get("destination") or (request.origin if direction == "return" else request.destination)).strip()
    if not origin or not destination:
        return None
    return FlightLeg(
        direction=direction,
        origin=origin,
        destination=destination,
        departure_at=_string_or_none(leg.get("departure_at") or leg.get("departure_time")),
        arrival_at=_string_or_none(leg.get("arrival_at") or leg.get("arrival_time")),
        stops=_int_or_none(leg.get("stops")),
        airline=str(leg.get("airline") or airline).strip(),
    )


def _map_hotel_offers(raw: Any) -> list[Offer]:
    if not isinstance(raw, list):
        return []
    mapped: list[Offer] = []
    for hotel in raw[:4]:
        if not isinstance(hotel, dict):
            continue
        price = _money_int(hotel.get("total_price") or hotel.get("total_price_usd"))
        if price <= 0:
            continue
        notes = [
            item for item in [
                str(hotel.get("address") or "").strip(),
                f"{hotel.get('star_rating')}-star" if hotel.get("star_rating") is not None else "",
                f"Review {hotel.get('review_score')}/10" if hotel.get("review_score") is not None else "",
                f"${_money_int(hotel.get('price_per_night') or hotel.get('price_per_night_usd'))} / night" if (hotel.get("price_per_night") or hotel.get("price_per_night_usd")) else "",
                "Source: Booking.com MCP live search",
                f"Booking link: {hotel.get('redirect_url')}" if hotel.get("redirect_url") else "",
            ] if item
        ]
        mapped.append(
            Offer(
                kind="hotel",
                title=str(hotel.get("name") or "Hotel option").strip(),
                provider="booking.com-mcp",
                price_usd=price,
                currency=str(hotel.get("currency") or "USD"),
                refundable=True,
                notes=notes,
            )
        )
    return mapped


def _money_int(value: Any) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    clean = str(value).strip()
    return clean or None


def _nights(request: TravelRequest) -> int:
    if not request.return_date:
        return 2
    return max(1, (request.return_date - request.depart_date).days)


def _flight_price(request: TravelRequest) -> int:
    multiplier = {"economy": 1, "premium_economy": 1.35, "business": 2.4, "first": 3.5}[request.cabin]
    segments = 2 if request.return_date else 1
    return int(420 * multiplier * request.travelers * segments)


def _fallback_flight_offer(request: TravelRequest) -> Offer:
    return Offer(
        kind="flight",
        title=f"{request.origin.upper()} to {request.destination}",
        provider="manual-sourcing-required",
        price_usd=0,
        refundable=False,
        notes=["Live Duffel results are unavailable. Manual sourcing is required before price, fare, or ticketing decisions."],
        flight_legs=_fallback_flight_legs(request),
    )


def _fallback_flight_legs(request: TravelRequest) -> list[FlightLeg]:
    legs = [
        FlightLeg(
            direction="outbound",
            origin=request.origin,
            destination=request.destination,
            departure_at=request.depart_date.isoformat(),
            arrival_at=request.depart_date.isoformat(),
            stops=1,
            airline="Planning estimate",
        )
    ]
    if request.return_date:
        legs.append(
            FlightLeg(
                direction="return",
                origin=request.destination,
                destination=request.origin,
                departure_at=request.return_date.isoformat(),
                arrival_at=request.return_date.isoformat(),
                stops=1,
                airline="Planning estimate",
            )
        )
    return legs


def _fallback_hotel_offer(request: TravelRequest, nights: int) -> Offer:
    return Offer(
        kind="hotel",
        title=f"Business-ready stay near {request.destination}",
        provider="manual-sourcing-required",
        price_usd=0,
        refundable=True,
        notes=["Live hotel inventory is unavailable. Manual sourcing is required before price or availability decisions."],
    )


def _itinerary(request: TravelRequest, nights: int) -> list[ItineraryItem]:
    purpose = request.purpose or "trip goals"
    return [
        ItineraryItem(day=1, title="Arrival and orientation", details=f"Arrive in {request.destination}, check in, and review {purpose}."),
        ItineraryItem(day=2, title="Primary work block", details="Keep the core schedule focused, with buffer time for transit and preparation."),
        ItineraryItem(day=min(3, nights + 1), title="Wrap-up and return prep", details="Capture notes, confirm receipts, and prepare for departure."),
    ]


def _policy_checks(request: TravelRequest, risk: str, estimated_total: int) -> list[str]:
    checks = [f"Risk level: {risk}."]
    if request.budget_usd and estimated_total > request.budget_usd:
        checks.append("Estimated plan is above the stated budget and needs approval.")
    else:
        checks.append("Estimated plan is within the stated budget or no budget was supplied.")
    if request.cabin in {"business", "first"}:
        checks.append("Premium cabin requires policy approval.")
    return checks


def _savings_suggestions(request: TravelRequest) -> list[str]:
    suggestions = ["Compare nearby airports and flexible hotel cancellation windows before booking."]
    if request.cabin != "economy":
        suggestions.append("Check whether premium economy satisfies the travel policy at a lower fare.")
    if request.travelers > 1:
        suggestions.append("Coordinate travelers on the same fare family to reduce change complexity.")
    return suggestions
