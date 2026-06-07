import base64
from dataclasses import dataclass
import hashlib
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import uuid4

from .currency import PLANNING_RATES, convert_planning_amount, format_currency_amount, origin_city_currency
from .internal_logger import INTERNAL_LOGGER_NAME, log_internal_issue
from .models import (
    AuditEvent,
    AuthContext,
    BudgetPolicyCheck,
    ChatRequest,
    ChatResponse,
    CorporateFlightOffer,
    CorporateGroundTransferOffer,
    CorporateHotelOffer,
    CorporateTravelPlan,
    CorporateTravelRequest,
    FlightLeg,
    ItineraryItem,
    Offer,
    PlanResponse,
    SupportedCurrency,
    TravelOption,
    TravelReadiness,
    TravelRequest,
    Trip,
)
from .privacy_gateway import anonymize_for_external_ai, assert_no_raw_pii, rehydrate_from_vault
from .request_rules import request_with_component_dependencies
from .security import mask_sensitive_customer_text, risk_label


CORPORATE_REVIEW_OPTION_COUNT = 3
FAST_FLIGHTS_DEFAULT_FETCH_MODE = "common"
FAST_FLIGHTS_FALLBACK_FETCH_MODE = "fallback"
FAST_FLIGHTS_PROVIDER = "fast-flights/google"
DEFAULT_TRANSFER_PICKUP_TIME = "09:00:00"
DEFAULT_HOTEL_CHECK_IN_START = "15:00"
DEFAULT_HOTEL_CHECKOUT_TIME = "11:00"
SYNTHETIC_OUTBOUND_DEPARTURE_TIME = "09:10:00"
SYNTHETIC_OUTBOUND_ARRIVAL_TIME = "17:35:00"
SYNTHETIC_RETURN_DEPARTURE_TIME = "18:20:00"
SYNTHETIC_RETURN_ARRIVAL_TIME = "23:55:00"
ISO_DATETIME_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?")
DEFAULT_PROVIDER_HTTP_TIMEOUT_SECONDS = 45.0
DEFAULT_PROVIDER_LOOKUP_TIMEOUT_SECONDS = 30.0
DEFAULT_MCP_HTTP_TIMEOUT_SECONDS = 35.0
DEFAULT_LLM_HTTP_TIMEOUT_SECONDS = 12.0
FLEXIBLE_DATE_POLICY_OFFSETS = (-1, 1)
SUPPORTED_BUDGET_CURRENCIES = {"USD", "INR", "EUR", "GBP", "CAD", "AUD", "JPY", "ZAR"}
CABIN_RANK = {"economy": 0, "premium_economy": 1, "business": 2, "first": 3}
HOTEL_STAR_TIERS = {
    "employee": (3, 3, 2),
    "manager": (4, 4, 3),
    "executive": (5, 5, 4),
}
HOTEL_TIER_LABELS = {
    "employee": "Employee tier: 2/3-star hotels",
    "manager": "Manager tier: 3/4-star hotels",
    "executive": "CEO tier: 4/5-star hotels",
}
CABIN_LABELS = {
    "economy": "economy",
    "premium_economy": "premium economy",
    "business": "business class",
    "first": "first class",
}
UBER_GUEST_RIDES_SCOPE = "guests.trips"
INDIA_ROUTE_KEYS = {
    "india",
    "hyderabad",
    "hyd",
    "delhi",
    "new delhi",
    "del",
    "bengaluru",
    "bangalore",
    "blr",
    "mumbai",
    "bombay",
    "bom",
    "chennai",
    "maa",
    "pune",
    "pnq",
    "kolkata",
    "ccu",
    "gurugram",
    "gurgaon",
    "noida",
}
AIRPORT_COORDINATES = {
    "JNB": (-26.1392, 28.2460),
}
TRANSFER_LOCATION_COORDINATES = {
    "sandton": (-26.1076, 28.0567),
    "sandton client office": (-26.1076, 28.0567),
    "johannesburg": (-26.2041, 28.0473),
    "isando": (-26.1399, 28.2026),
    "o.r.tambo": (-26.1337, 28.2420),
    "or tambo": (-26.1337, 28.2420),
}


@dataclass(frozen=True)
class CorporatePlanDraft:
    request: CorporateTravelRequest
    plan: CorporateTravelPlan
    stage_times: dict[str, int]


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
    return generate_corporate_plan_with_request(
        request,
        policy_rows=policy_rows,
        traveller_history_rows=traveller_history_rows,
        visa_rule_rows=visa_rule_rows,
    )[1]


def generate_corporate_plan_with_request(
    request: CorporateTravelRequest,
    policy_rows: list[dict[str, object]] | None = None,
    traveller_history_rows: list[dict[str, object]] | None = None,
    visa_rule_rows: list[dict[str, object]] | None = None,
) -> tuple[CorporateTravelRequest, CorporateTravelPlan]:
    total_started_at = time.perf_counter()
    policy_rows = policy_rows or []
    traveller_history_rows = traveller_history_rows or []
    visa_rule_rows = visa_rule_rows or []
    draft = _build_corporate_base_plan(request, policy_rows, traveller_history_rows, visa_rule_rows)
    selected = _flexible_date_policy_match(draft, policy_rows, traveller_history_rows, visa_rule_rows) or draft

    stage_started_at = time.perf_counter()
    plan = _enhance_corporate_plan_with_llm(selected.plan, selected.request, policy_rows, traveller_history_rows, visa_rule_rows)
    stage_times = dict(selected.stage_times)
    stage_times["llm_enhancement_ms"] = _elapsed_ms(stage_started_at)
    _log_corporate_plan_timing(selected.request, stage_times, _elapsed_ms(total_started_at))
    return selected.request, plan


def _build_corporate_base_plan(
    request: CorporateTravelRequest,
    policy_rows: list[dict[str, object]],
    traveller_history_rows: list[dict[str, object]],
    visa_rule_rows: list[dict[str, object]],
) -> CorporatePlanDraft:
    request = request_with_component_dependencies(request)
    stage_times: dict[str, int] = {}
    stage_started_at = time.perf_counter()
    missing = _corporate_missing_information(request)
    nights = _corporate_nights(request)
    request, cabin_recommendation_note = _request_with_designation_cabin(request, nights, policy_rows)
    stage_times["readiness_ms"] = _elapsed_ms(stage_started_at)

    stage_started_at = time.perf_counter()
    live_flights, live_hotels, live_transfers, provider_events = _corporate_live_provider_offers(request)
    stage_times["provider_search_ms"] = _elapsed_ms(stage_started_at)

    stage_started_at = time.perf_counter()
    flight_offers = _corporate_flight_offers(request, live_flights)
    hotel_offers = _corporate_hotel_offers(request, live_hotels, nights)
    ground_transfer_offers = _corporate_ground_transfer_offers(request, live_transfers, hotel_offers, flight_offers)
    options = _corporate_options(request, nights, flight_offers, hotel_offers, ground_transfer_offers)
    best_cost = options[0].estimated_cost
    readiness = _travel_readiness(request, visa_rule_rows)
    budget_check = _budget_policy_check(request, best_cost, policy_rows, options)
    if readiness.passport_status == "Blocking Issue" or readiness.visa_status == "Blocking Issue":
        budget_check.approval_required = True
        reason = "Document readiness has a blocking issue."
        if budget_check.approval_reason:
            reason = f"{budget_check.approval_reason} {reason}"
        budget_check.approval_reason = reason

    history_note = _history_note(request, traveller_history_rows)
    request_summary = _request_summary(request)
    notes = [
        *_corporate_provider_notes(request, flight_offers, live_hotels, ground_transfer_offers, provider_events),
        "Visa readiness is only verified when a matching provided visa rule exists.",
    ]
    notes.append(_hotel_tier_note(request))
    if cabin_recommendation_note:
        notes.append(cabin_recommendation_note)
    currency_note = _currency_conversion_note(request)
    if currency_note:
        notes.append(currency_note)
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
        flight_offers=flight_offers,
        selected_flight_offer_id=flight_offers[0].id if flight_offers else None,
        hotel_offers=hotel_offers,
        selected_hotel_offer_id=hotel_offers[0].id if hotel_offers else None,
        ground_transfer_offers=ground_transfer_offers,
        selected_ground_transfer_offer_id=ground_transfer_offers[0].id if ground_transfer_offers else None,
        agent_note=_agent_note(readiness, budget_check, missing),
        agent_notes=notes,
        customer_message_draft=_customer_message(request, readiness, budget_check),
        customer_itinerary_draft=_customer_itinerary(request, options[0], nights),
        approval_status=approval_status,
    )
    stage_times["deterministic_plan_ms"] = _elapsed_ms(stage_started_at)
    return CorporatePlanDraft(request=request, plan=base_plan, stage_times=stage_times)


def _flexible_date_policy_match(
    base_draft: CorporatePlanDraft,
    policy_rows: list[dict[str, object]],
    traveller_history_rows: list[dict[str, object]],
    visa_rule_rows: list[dict[str, object]],
) -> CorporatePlanDraft | None:
    if not _should_try_flexible_dates(base_draft):
        return None
    for offset in FLEXIBLE_DATE_POLICY_OFFSETS:
        candidate_request = _request_with_date_offset(base_draft.request, offset)
        if not candidate_request:
            continue
        candidate_draft = _build_corporate_base_plan(candidate_request, policy_rows, traveller_history_rows, visa_rule_rows)
        if candidate_draft.plan.budget_policy_check.policy_status == "Compliant":
            return _draft_with_flexible_date_note(candidate_draft, base_draft.request, offset)
    return None


def _should_try_flexible_dates(draft: CorporatePlanDraft) -> bool:
    travel = draft.request.travel_details
    if not travel.flexible_dates:
        return False
    if not (travel.depart_date or travel.return_date):
        return False
    if draft.plan.missing_information:
        return False
    return draft.plan.budget_policy_check.policy_status == "Policy Violation"


def _request_with_date_offset(request: CorporateTravelRequest, offset_days: int) -> CorporateTravelRequest | None:
    travel = request.travel_details
    delta = timedelta(days=offset_days)
    depart_date = travel.depart_date + delta if travel.depart_date else None
    return_date = travel.return_date + delta if travel.return_date else None
    if depart_date == travel.depart_date and return_date == travel.return_date:
        return None
    return request.model_copy(update={"travel_details": travel.model_copy(update={"depart_date": depart_date, "return_date": return_date})})


def _draft_with_flexible_date_note(
    draft: CorporatePlanDraft,
    original_request: CorporateTravelRequest,
    offset_days: int,
) -> CorporatePlanDraft:
    direction = "one day earlier" if offset_days < 0 else "one day later"
    original_dates = _date_range_text(original_request)
    selected_dates = _date_range_text(draft.request)
    agent_note = (
        "Flexible date policy match: the form allowed flexible dates, so the itinerary moved "
        f"{direction} from {original_dates} to {selected_dates} to stay inside policy."
    )
    customer_reason = (
        f"Flexible date fit: uses travel dates {direction} because the form allowed flexible dates "
        "and this keeps the itinerary inside policy."
    )
    options = [
        option.model_copy(update={"recommendation_reason": _append_sentence(option.recommendation_reason, customer_reason)})
        for option in draft.plan.travel_options
    ]
    plan = draft.plan.model_copy(update={"agent_notes": [agent_note, *draft.plan.agent_notes], "travel_options": options})
    return CorporatePlanDraft(request=draft.request, plan=plan, stage_times=draft.stage_times)


def _date_range_text(request: CorporateTravelRequest) -> str:
    travel = request.travel_details
    depart = travel.depart_date.isoformat() if travel.depart_date else "date pending"
    ret = travel.return_date.isoformat() if travel.return_date else "return pending"
    return f"{depart} to {ret}"


def _append_sentence(text: str, sentence: str) -> str:
    if sentence in text:
        return text
    return f"{text.rstrip()} {sentence}"


def _corporate_missing_information(request: CorporateTravelRequest) -> list[str]:
    missing: list[str] = []
    traveller = request.traveller_details
    travel = request.travel_details
    if not traveller.traveler_name:
        missing.append("traveller_details.traveler_name")
    if not (request.requester_email or traveller.traveler_email):
        missing.append("requester_email")
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
    if (travel.include_return_flight or travel.include_hotel) and not travel.return_date:
        missing.append("travel_details.return_date")
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
                    "budget_status": "Not Applied",
                    "policy_status": "Compliant | Needs Approval | Policy Violation | Needs Review",
                    "approval_required": True,
                    "approval_reason": "string",
                    "total_budget": None,
                    "estimated_cost": 0,
                },
                "travel_options": [
                    {
                        "option_name": "Best tier fit",
                        "flight_offer_id": "string | null",
                        "ground_transfer_offer_id": "string | null",
                        "flight_summary": "string",
                        "hotel_summary": "string",
                        "transfer_summary": "string",
                        "estimated_cost": 0,
                        "pros": [],
                        "cons": [],
                        "policy_status": "string",
                        "recommendation_reason": "string",
                    }
                ],
                "flight_offers": [],
                "selected_flight_offer_id": "string | null",
                "hotel_offers": [],
                "selected_hotel_offer_id": "string | null",
                "ground_transfer_offers": [],
                "selected_ground_transfer_offer_id": "string | null",
                "agent_note": "string",
                "agent_notes": [],
                "customer_message_draft": "string",
                "customer_itinerary_draft": "string",
                "approval_status": "Plan Generated",
            },
        }
        anonymized = anonymize_for_external_ai(payload)
        assert_no_raw_pii(anonymized.payload, anonymized.token_map)
        text = _chat_completion(
            [
                {
                    "role": "system",
                    "content": (
                        "You are an AI assistant for a corporate travel company. Return strict json only. "
                        "Improve the customer-facing summary, travel options, agent notes, customer message, "
                        "and itinerary draft from the validated base plan. Do not invent passport, visa, "
                        "policy, price, or approval facts. Visa/passport conclusions must remain review-oriented "
                        "unless verified by supplied rule data. The validated base plan is authoritative for cabin "
                        "class, provider names, dates, IDs, prices, and policy status. Never recommend or describe "
                        "a cabin above the employee band or supplied allowed_cabins policy; cost fit alone cannot "
                        "upgrade cabin class. Preserve the base flight offer cabin exactly in customer-facing text. "
                        "Keep recommendation reasons concise and bullet-friendly. Do not expose traveller IDs, raw roster "
                        "or spreadsheet matching, hidden process, or internal model/tool details. Do not create bookings "
                        "or payment instructions."
                    ),
                },
                {"role": "user", "content": json.dumps(anonymized.payload, default=str)},
            ],
            max_tokens=1800,
            json_response=True,
        )
        llm_payload = rehydrate_from_vault(json.loads(_extract_json_object(text)), anonymized.token_map)
        llm_plan = CorporateTravelPlan.model_validate(llm_payload)
        safe_options = []
        for index, base_option in enumerate(base_plan.travel_options):
            option = llm_plan.travel_options[index] if index < len(llm_plan.travel_options) else base_option
            component_updates: dict[str, Any] = {}
            if not request.travel_details.include_outbound_flight or not request.travel_details.include_return_flight:
                component_updates["flight_summary"] = base_option.flight_summary
            if not request.travel_details.include_hotel:
                component_updates["hotel_summary"] = base_option.hotel_summary
            safe_options.append(
                option.model_copy(
                    update={
                        "option_name": base_option.option_name,
                        "flight_offer_id": base_option.flight_offer_id,
                        "ground_transfer_offer_id": base_option.ground_transfer_offer_id,
                        "estimated_cost": base_option.estimated_cost,
                        "policy_status": base_option.policy_status,
                        "recommendation_reason": option.recommendation_reason,
                        **component_updates,
                    }
                )
            )
        customer_itinerary = mask_sensitive_customer_text(llm_plan.customer_itinerary_draft)
        if not request.travel_details.include_hotel or not request.travel_details.include_outbound_flight or not request.travel_details.include_return_flight:
            customer_itinerary = base_plan.customer_itinerary_draft
        return llm_plan.model_copy(
            update={
                "missing_information": base_plan.missing_information,
                "travel_readiness": base_plan.travel_readiness,
                "budget_policy_check": base_plan.budget_policy_check,
                "travel_options": safe_options,
                "flight_offers": base_plan.flight_offers,
                "selected_flight_offer_id": base_plan.selected_flight_offer_id,
                "hotel_offers": base_plan.hotel_offers,
                "selected_hotel_offer_id": base_plan.selected_hotel_offer_id,
                "ground_transfer_offers": base_plan.ground_transfer_offers,
                "selected_ground_transfer_offer_id": base_plan.selected_ground_transfer_offer_id,
                "approval_status": base_plan.approval_status,
                "customer_message_draft": mask_sensitive_customer_text(llm_plan.customer_message_draft),
                "customer_itinerary_draft": customer_itinerary,
                "agent_notes": [*llm_plan.agent_notes, f"{_llm_provider_name()} generated the narrative draft; deterministic rules kept document, hotel tier, policy, and approval statuses."],
            }
        )
    except Exception as exc:
        log_internal_issue(
            logging.getLogger(INTERNAL_LOGGER_NAME),
            "corporate.llm_enhancement.failed",
            f"{_llm_provider_name()} planning enhancement failed.",
            error=exc,
            provider=_llm_provider_name(),
            request_id=request.id,
        )
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
    components = _component_summary(request)
    return f"{traveller} needs {purpose} travel from {origin} to {destination}, departing {depart} and returning {ret}. Components: {components}."


def _corporate_nights(request: CorporateTravelRequest) -> int:
    if not request.travel_details.include_hotel:
        return 0
    depart = request.travel_details.depart_date
    ret = request.travel_details.return_date
    if not depart or not ret:
        return 2
    return max(1, (ret - depart).days)


def _request_with_designation_cabin(
    request: CorporateTravelRequest,
    _nights: int,
    policy_rows: list[dict[str, object]],
) -> tuple[CorporateTravelRequest, str | None]:
    band_cabin_cap = _band_cabin_cap(request, policy_rows)
    current_cabin = request.travel_details.cabin
    if band_cabin_cap and CABIN_RANK[current_cabin] > CABIN_RANK[band_cabin_cap]:
        target_cabin = band_cabin_cap
        note = (
            "Cabin policy: request form asked for "
            f"{CABIN_LABELS[current_cabin]}, but employee band policy allows up to {CABIN_LABELS[band_cabin_cap]}. "
            f"Planning capped the cabin to {CABIN_LABELS[target_cabin]}."
        )
    else:
        return request, None
    travel = request.travel_details.model_copy(update={"cabin": target_cabin})
    return request.model_copy(update={"travel_details": travel}), note


def _band_cabin_cap(request: CorporateTravelRequest, policy_rows: list[dict[str, object]]) -> str | None:
    return (
        _policy_cabin_cap(request, policy_rows)
        or _band_text_cabin_cap(request.traveller_details.employee_band)
        or _band_text_cabin_cap(request.company_details.approval_band)
        or _band_text_cabin_cap(request.traveller_details.employee_level)
        or _band_text_cabin_cap(request.company_details.policy_tier)
    )


def _policy_cabin_cap(request: CorporateTravelRequest, policy_rows: list[dict[str, object]]) -> str | None:
    allowed_cabins: set[str] = set()
    for row in _cabin_policy_rows_for_request(request, policy_rows):
        allowed = row.get("allowed_cabins") or row.get("allowed_cabin") or row.get("cabin")
        allowed_cabins.update(_allowed_cabins_from_text(allowed))
    return _highest_cabin(allowed_cabins)


def _cabin_policy_rows_for_request(
    request: CorporateTravelRequest,
    policy_rows: list[dict[str, object]],
) -> list[dict[str, object]]:
    request_keys = {
        _compact_key(value)
        for value in (
            request.traveller_details.employee_band,
            request.traveller_details.employee_level,
            request.company_details.approval_band,
            request.company_details.policy_tier,
        )
        if value
    }
    matching_rows: list[dict[str, object]] = []
    generic_rows: list[dict[str, object]] = []
    for row in policy_rows:
        row_keys = {
            _compact_key(row.get(key))
            for key in ("employee_band", "traveler_band", "traveller_band", "band", "profile_type", "approval_band", "approver_band", "policy_tier", "tier")
            if row.get(key)
        }
        if row_keys:
            if request_keys & row_keys:
                matching_rows.append(row)
        else:
            generic_rows.append(row)
    if matching_rows:
        return matching_rows
    return generic_rows if len(generic_rows) == len(policy_rows) else []


def _allowed_cabins_from_text(value: object) -> set[str]:
    if value is None:
        return set()
    cabins: set[str] = set()
    for part in re.split(r"[,;/|]+", str(value)):
        cabin = _cabin_from_text(part)
        if cabin:
            cabins.add(cabin)
    if cabins:
        return cabins
    compact = _compact_key(value)
    return {
        cabin
        for marker, cabin in (
            ("premiumeconomy", "premium_economy"),
            ("business", "business"),
            ("first", "first"),
            ("economy", "economy"),
        )
        if marker in compact
    }


def _cabin_from_text(value: object) -> str | None:
    compact = _compact_key(value)
    if "premiumeconomy" in compact:
        return "premium_economy"
    if "business" in compact:
        return "business"
    if "first" in compact:
        return "first"
    if "economy" in compact:
        return "economy"
    return None


def _highest_cabin(cabins: set[str]) -> str | None:
    if not cabins:
        return None
    return max(cabins, key=lambda cabin: CABIN_RANK[cabin])


def _hotel_tier_key(request: CorporateTravelRequest) -> str:
    for value in (
        request.traveller_details.employee_band,
        request.traveller_details.employee_level,
        request.company_details.approval_band,
        request.company_details.policy_tier,
    ):
        tier = _hotel_tier_key_from_text(value)
        if tier:
            return tier
    return "manager"


def _hotel_tier_key_from_text(value: object) -> str | None:
    compact = _compact_key(value)
    if not compact:
        return None
    if compact == "1" or ("band" in compact and compact.endswith("1")):
        return "employee"
    if compact == "2" or ("band" in compact and compact.endswith("2")):
        return "manager"
    if compact in {"3", "4"} or ("band" in compact and (compact.endswith("3") or compact.endswith("4"))):
        return "executive"
    if any(marker in compact for marker in ("ceo", "chief", "founder", "president", "chair", "executive", "director", "vp", "vicepresident", "head")):
        return "executive"
    if "manager" in compact:
        return "manager"
    if any(marker in compact for marker in ("employee", "associate", "analyst", "lead", "staff", "individualcontributor", "bande", "bandic")):
        return "employee"
    return None


def _hotel_star_sequence(request: CorporateTravelRequest) -> tuple[int, int, int]:
    return HOTEL_STAR_TIERS[_hotel_tier_key(request)]


def _hotel_star_for_option(request: CorporateTravelRequest, option_index: int) -> int:
    sequence = _hotel_star_sequence(request)
    return sequence[min(option_index, len(sequence) - 1)]


def _hotel_tier_note(request: CorporateTravelRequest) -> str:
    return f"Hotel tier policy: {HOTEL_TIER_LABELS[_hotel_tier_key(request)]}; cost fields do not change the hotel tier."


def _band_text_cabin_cap(value: object) -> str | None:
    compact = _compact_key(value)
    if not compact:
        return None
    if compact == "1" or ("band" in compact and compact.endswith("1")):
        return "economy"
    if compact == "2" or ("band" in compact and compact.endswith("2")):
        return "premium_economy"
    if compact == "3" or ("band" in compact and compact.endswith("3")):
        return "business"
    if compact == "4" or ("band" in compact and compact.endswith("4")):
        return "first"
    if any(marker in compact for marker in ("ceo", "chief", "founder", "president", "chair", "executive", "bandc", "bandx")):
        return "first"
    if any(marker in compact for marker in ("principal", "director", "vp", "vicepresident", "head", "bandm3", "bandm4", "bandm5")):
        return "business"
    if any(marker in compact for marker in ("manager", "bandm1", "bandm2")):
        return "premium_economy"
    if any(marker in compact for marker in ("employee", "associate", "analyst", "lead", "staff", "individualcontributor", "bande", "bandic")):
        return "economy"
    return None


def _compact_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _corporate_trip_request(request: CorporateTravelRequest) -> TravelRequest | None:
    travel = request.travel_details
    if not (travel.include_outbound_flight or travel.include_return_flight):
        return None
    if not (travel.origin and travel.destination):
        return None
    if travel.include_outbound_flight and not travel.depart_date:
        return None
    if not travel.include_outbound_flight and travel.include_return_flight and not travel.return_date:
        return None

    origin = travel.origin
    destination = travel.destination
    depart_date = travel.depart_date
    return_date = travel.return_date if travel.include_return_flight else None
    if not travel.include_outbound_flight and travel.include_return_flight:
        origin = travel.destination
        destination = travel.origin
        depart_date = travel.return_date
        return_date = None

    return TravelRequest(
        origin=origin,
        destination=destination,
        depart_date=depart_date,
        return_date=return_date,
        travelers=travel.travelers,
        cabin=travel.cabin,
        budget_usd=None,
        purpose=travel.trip_purpose,
    )


def _corporate_live_provider_offers(request: CorporateTravelRequest) -> tuple[list[Offer], list[Offer], list[CorporateGroundTransferOffer], list[AuditEvent]]:
    trip_request = _corporate_trip_request(request)
    if not trip_request:
        return [], [], [], []
    flights, hotels, events = _live_provider_offers(trip_request, request.owner_id)
    if request.travel_details.include_ground_transfer:
        events.append(AuditEvent(
            actor_id=request.owner_id or None,
            event_type="synthetic.transfer.generated",
            message="Synthetic airport transfer options selected for POC planning.",
        ))
    return (
        flights if (request.travel_details.include_outbound_flight or request.travel_details.include_return_flight) else [],
        hotels if request.travel_details.include_hotel else [],
        [],
        events,
    )


def _transfer_airport_code(request: CorporateTravelRequest) -> str:
    value = request.travel_details.destination or ""
    if len(value.strip()) == 3 and value.strip().isalpha():
        return value.strip().upper()
    return CITY_IATA.get(_norm(value), value.strip().upper()[:3] or "AIR")


def _transfer_pickup_time(request: CorporateTravelRequest, flight: CorporateFlightOffer | None = None) -> str:
    arrival = _flight_arrival_time(flight)
    if arrival:
        return arrival
    depart = request.travel_details.depart_date
    if not depart:
        raise RuntimeError("Transfer pickup date is missing")
    return f"{depart.isoformat()}T{DEFAULT_TRANSFER_PICKUP_TIME}"


def _flight_arrival_time(flight: CorporateFlightOffer | None) -> str | None:
    if not flight:
        return None
    matches = ISO_DATETIME_PATTERN.findall(flight.outbound or "")
    return matches[-1] if matches else None


def _corporate_flight_offers(request: CorporateTravelRequest, live_offers: list[Offer] | None = None) -> list[CorporateFlightOffer]:
    travel = request.travel_details
    if not (travel.include_outbound_flight or travel.include_return_flight):
        return []
    if not (travel.origin and travel.destination):
        return []

    trip_request = _corporate_trip_request(request)
    live_offers = list(live_offers or [])
    if not live_offers:
        estimated = _corporate_flight_estimate(request)
        if not trip_request:
            return []
        live_offers = [
            _fallback_flight_offer(trip_request).model_copy(update={
                "id": f"offer_synthetic_tier_{uuid_suffix(travel.origin, travel.destination)}",
                "title": f"Best tier-fit option · {travel.origin.upper()} -> {travel.destination}",
                "provider": "synthetic-duffel/tier-fit",
                "price_usd": int(estimated * 0.92),
                "notes": ["Planning estimate shaped like a Duffel offer.", "Verify fare and availability before confirmation."],
            }),
        ]
    return [_corporate_flight_offer_from_offer(offer, request) for offer in live_offers[:4]]


def _corporate_provider_notes(
    request: CorporateTravelRequest,
    flight_offers: list[CorporateFlightOffer],
    hotel_offers: list[Offer],
    ground_transfer_offers: list[CorporateGroundTransferOffer],
    events: list[AuditEvent],
) -> list[str]:
    notes: list[str] = []
    if not (request.travel_details.include_outbound_flight or request.travel_details.include_return_flight):
        notes.append("Flight search skipped because the request form excluded flight planning.")
    elif any(offer.source == "duffel" for offer in flight_offers):
        notes.append("Live flight offers are attached for agent review.")
    elif any(offer.provider.startswith("fast-flights/") for offer in flight_offers):
        notes.append("Live planning flight estimates are attached; manual fare and availability confirmation is required.")
    else:
        notes.append("Live flight search is unavailable; flight options require manual sourcing before final confirmation.")

    if not request.travel_details.include_hotel:
        notes.append("Hotel search skipped because the request form excluded hotel planning.")
    elif hotel_offers:
        notes.append("Live hotel offers informed the hotel summaries.")
    else:
        notes.append("Live hotel search is unavailable; hotel options require manual sourcing before confirmation.")

    if not request.travel_details.include_ground_transfer:
        notes.append("Airport transfer skipped because the request excluded cab planning.")
    elif any(offer.source == "uber" for offer in ground_transfer_offers):
        notes.append("Live airport transfer estimates informed the airport transfer options for pipeline testing.")
    elif ground_transfer_offers:
        notes.append("Synthetic airport transfer options are generated for POC planning variation; no supplier search or booking has been performed.")
    else:
        notes.append("Airport transfer options require a destination and travel date before planning.")

    unavailable = [event.event_type for event in events if event.event_type.endswith(".unavailable")]
    if unavailable:
        notes.append(f"Provider availability recorded for audit: {', '.join(unavailable)}.")
    return notes


def _corporate_flight_offer_from_offer(offer: Offer, request: CorporateTravelRequest) -> CorporateFlightOffer:
    legs = offer.flight_legs or []
    outbound = _leg_summary(legs[0]) if legs else f"{request.travel_details.origin or 'Origin'} to {request.travel_details.destination or 'destination'}"
    return_leg = _leg_summary(legs[1]) if len(legs) > 1 else None
    source = "duffel" if offer.provider.startswith("duffel-api/") or offer.provider.startswith("duffel-mcp/") else "synthetic"
    return CorporateFlightOffer(
        id=_source_offer_id(offer),
        provider=offer.provider,
        airline=_airline_from_offer(offer),
        summary=offer.title,
        total_amount=offer.price_usd,
        currency=offer.currency,
        outbound=outbound,
        return_leg=return_leg,
        cabin=request.travel_details.cabin,
        expires_at=_note_value(offer.notes, "Expires at:"),
        source=source,
        notes=offer.notes,
    )


def _corporate_hotel_offers(request: CorporateTravelRequest, live_offers: list[Offer] | None, nights: int) -> list[CorporateHotelOffer]:
    if not request.travel_details.include_hotel:
        return []
    offers = list(live_offers or [])
    hotel_stars = _hotel_star_sequence(request)
    if not offers:
        destination = request.travel_details.destination or "the destination"
        area = request.preferences.preferred_hotel_area or request.preferences.hotel_preference or "business district"
        base = _corporate_hotel_estimate(request, nights)
        base_display, display_currency = _planning_currency_amount(base, request)
        return [
            CorporateHotelOffer(
                id=f"hotel_synthetic_business_{uuid_suffix(destination, area)}",
                provider="synthetic-booking/business",
                name=f"Business Stay near {destination}",
                summary=f"Business-ready hotel in {area} with refundable planning assumptions.",
                total_amount=max(base_display, 1),
                currency=display_currency,
                address=area,
                star_rating=hotel_stars[0],
                check_in=request.travel_details.depart_date,
                check_out=request.travel_details.return_date,
                check_in_starts_at=DEFAULT_HOTEL_CHECK_IN_START,
                checkout_time=DEFAULT_HOTEL_CHECKOUT_TIME,
                room_notes="Standard corporate room; bedding and loyalty preferences require hotel confirmation.",
                cancellation_notes="Cancellation rules must be verified before confirmation.",
                unsent_special_requests=request.special_requests,
                nights=nights,
                rooms=1,
                guests=request.travel_details.travelers,
                image_url="/travel-media/hotel-business.png",
                source="synthetic",
                notes=["Planning estimate for hotel selection.", "Confirm availability and cancellation terms before confirmation."],
            ),
            CorporateHotelOffer(
                id=f"hotel_synthetic_office_{uuid_suffix(destination, area, 'office')}",
                provider="synthetic-booking/office",
                name=f"Office Proximity Hotel",
                summary="Prioritizes commute simplicity and meeting-day reliability.",
                total_amount=max(int(round(base_display * 1.08)), 1),
                currency=display_currency,
                address=area,
                star_rating=hotel_stars[1],
                check_in=request.travel_details.depart_date,
                check_out=request.travel_details.return_date,
                check_in_starts_at=DEFAULT_HOTEL_CHECK_IN_START,
                checkout_time=DEFAULT_HOTEL_CHECKOUT_TIME,
                room_notes="Standard corporate room; bedding and loyalty preferences require hotel confirmation.",
                cancellation_notes="Cancellation rules must be verified before confirmation.",
                unsent_special_requests=request.special_requests,
                nights=nights,
                rooms=1,
                guests=request.travel_details.travelers,
                image_url="/travel-media/hotel-city.png",
                source="synthetic",
                notes=["Planning estimate for hotel selection.", "Confirm availability and cancellation terms before confirmation."],
            ),
            CorporateHotelOffer(
                id=f"hotel_synthetic_flex_{uuid_suffix(destination, area, 'flex')}",
                provider="synthetic-booking/flexible",
                name=f"Flexible Corporate Stay",
                summary="Higher buffer option with stronger cancellation flexibility for disruption recovery.",
                total_amount=max(int(round(base_display * 1.18)), 1),
                currency=display_currency,
                address=area,
                star_rating=hotel_stars[2],
                check_in=request.travel_details.depart_date,
                check_out=request.travel_details.return_date,
                check_in_starts_at=DEFAULT_HOTEL_CHECK_IN_START,
                checkout_time=DEFAULT_HOTEL_CHECKOUT_TIME,
                room_notes="Enhanced corporate room assumption; final room type requires hotel confirmation.",
                cancellation_notes="Flexible cancellation assumption must be verified before confirmation.",
                unsent_special_requests=request.special_requests,
                nights=nights,
                rooms=1,
                guests=request.travel_details.travelers,
                image_url="/travel-media/hotel-lobby.png",
                source="synthetic",
                notes=["Planning estimate for hotel selection.", "Confirm availability and cancellation terms before confirmation."],
            ),
        ]
    return [_corporate_hotel_offer_from_offer(offer, request, nights, index) for index, offer in enumerate(offers[:4])]


def _corporate_hotel_offer_from_offer(offer: Offer, request: CorporateTravelRequest, nights: int, option_index: int = 0) -> CorporateHotelOffer:
    source = "booking" if offer.provider.startswith("booking.com") else "synthetic"
    return CorporateHotelOffer(
        id=_source_offer_id(offer),
        provider=offer.provider,
        name=offer.title,
        summary=_corporate_hotel_summary(offer, offer.title, nights, "business amenities"),
        total_amount=max(offer.price_usd, 1),
        currency=offer.currency,
        address=_hotel_address_from_notes(offer.notes),
        star_rating=_hotel_star_for_option(request, option_index),
        check_in=request.travel_details.depart_date,
        check_out=request.travel_details.return_date,
        check_in_starts_at=DEFAULT_HOTEL_CHECK_IN_START,
        checkout_time=DEFAULT_HOTEL_CHECKOUT_TIME,
        room_notes="Room type, bedding, and loyalty benefits require hotel confirmation.",
        cancellation_notes="Provider cancellation terms must be verified before confirmation.",
        unsent_special_requests=request.special_requests,
        nights=nights,
        rooms=1,
        guests=request.travel_details.travelers,
        image_url=_note_value(offer.notes, "Photo URL:") or "/travel-media/hotel-business.png",
        source=source,
        notes=offer.notes,
    )


def _corporate_ground_transfer_offers(
    request: CorporateTravelRequest,
    live_offers: list[CorporateGroundTransferOffer],
    hotel_offers: list[CorporateHotelOffer],
    flight_offers: list[CorporateFlightOffer],
) -> list[CorporateGroundTransferOffer]:
    if not request.travel_details.include_ground_transfer:
        return []
    if not request.travel_details.destination or not request.travel_details.depart_date:
        return []
    offers = list(live_offers)
    if offers:
        return offers[:CORPORATE_REVIEW_OPTION_COUNT]

    uber_offers = _uber_ground_transfer_offers(request, hotel_offers, flight_offers)
    if uber_offers:
        return uber_offers[:CORPORATE_REVIEW_OPTION_COUNT]

    airport = _transfer_airport_code(request)
    base = _corporate_transfer_estimate(request)
    passengers = request.travel_details.travelers
    base_display, currency = _planning_currency_amount(base, request)
    destination_label = request.travel_details.destination or "Destination"
    best_hotel = hotel_offers[0] if hotel_offers else None
    fastest_hotel = hotel_offers[1] if len(hotel_offers) > 1 else best_hotel
    comfort_hotel = hotel_offers[2] if len(hotel_offers) > 2 else fastest_hotel
    best_flight = flight_offers[0] if flight_offers else None
    fastest_flight = flight_offers[1] if len(flight_offers) > 1 else best_flight
    comfort_flight = flight_offers[2] if len(flight_offers) > 2 else fastest_flight

    def dropoff(hotel: CorporateHotelOffer | None) -> tuple[str, str | None]:
        if hotel:
            return hotel.name, hotel.address
        return (
            request.travel_details.meeting_location or "Hotel or meeting location",
            request.travel_details.meeting_location or request.preferences.preferred_hotel_area,
        )

    best_dropoff_label, best_dropoff_address = dropoff(best_hotel)
    fastest_dropoff_label, fastest_dropoff_address = dropoff(fastest_hotel)
    comfort_dropoff_label, comfort_dropoff_address = dropoff(comfort_hotel)
    return [
        CorporateGroundTransferOffer(
            id=f"transfer_synthetic_sedan_{uuid_suffix(request.id, airport)}",
            provider=f"{destination_label} Airport Cars",
            pickup_airport_code=airport,
            pickup_time=_transfer_pickup_time(request, best_flight),
            dropoff_label=best_dropoff_label,
            dropoff_address=best_dropoff_address,
            service_type="PRIVATE",
            vehicle_type="Business sedan",
            passengers=passengers,
            baggage="1 checked bag and 1 carry-on per traveler",
            total_amount=max(base_display, 1),
            currency=currency,
            cancellation_notes="Free cancellation assumed until 24 hours before pickup; verify before confirmation.",
            source="synthetic",
            notes=[
                "Planning estimate shaped like a car-service quote.",
                "Meet driver at arrivals with name-board assumption.",
                "Confirm pickup terms before confirmation.",
            ],
        ),
        CorporateGroundTransferOffer(
            id=f"transfer_synthetic_priority_{uuid_suffix(request.id, airport, 'priority')}",
            provider=f"{destination_label} Executive Transfers",
            pickup_airport_code=airport,
            pickup_time=_transfer_pickup_time(request, fastest_flight),
            dropoff_label=fastest_dropoff_label,
            dropoff_address=fastest_dropoff_address,
            service_type="MEET_AND_GREET",
            vehicle_type="Priority sedan",
            passengers=passengers,
            baggage="Includes meet-and-greet and 60 minutes airport waiting time",
            total_amount=max(int(round(base_display * 1.2)), 1),
            currency=currency,
            cancellation_notes="Partial fee assumed inside 12 hours of pickup; verify provider rules.",
            source="synthetic",
            notes=[
                "Planning estimate with priority pickup posture.",
                "Best fit when executives need a shorter airport handoff.",
                "Confirm pickup terms before confirmation.",
            ],
        ),
        CorporateGroundTransferOffer(
            id=f"transfer_synthetic_suv_{uuid_suffix(request.id, airport, 'suv')}",
            provider="Corporate Chauffeur Desk",
            pickup_airport_code=airport,
            pickup_time=_transfer_pickup_time(request, comfort_flight),
            dropoff_label=comfort_dropoff_label,
            dropoff_address=comfort_dropoff_address,
            service_type="PRIVATE",
            vehicle_type="Executive SUV",
            passengers=passengers,
            baggage="Extra luggage buffer for 2 checked bags per traveler",
            total_amount=max(int(round(base_display * 1.45)), 1),
            currency=currency,
            cancellation_notes="Higher no-show fee assumed; verify before issuing final booking instruction.",
            source="synthetic",
            notes=[
                "Planning estimate for higher comfort and luggage capacity.",
                "Use when senior traveler comfort matters more than lowest cost.",
                "Confirm pickup terms before confirmation.",
            ],
        ),
    ]


def _uber_ground_transfer_offers(
    request: CorporateTravelRequest,
    hotel_offers: list[CorporateHotelOffer],
    flight_offers: list[CorporateFlightOffer],
) -> list[CorporateGroundTransferOffer]:
    token = _uber_access_token()
    if not token:
        return []
    pickup, dropoff = _uber_transfer_coordinates(request, hotel_offers[0] if hotel_offers else None)
    if not pickup or not dropoff:
        return []
    try:
        estimates = _uber_estimates(token, pickup, dropoff)
    except Exception as exc:
        log_internal_issue(
            logging.getLogger(INTERNAL_LOGGER_NAME),
            "uber.estimates.unavailable",
            "Uber ride estimates were unavailable.",
            error=exc,
            provider="uber",
            request_id=request.id,
        )
        return []
    if not estimates:
        return []

    airport = _transfer_airport_code(request)
    hotel = hotel_offers[0] if hotel_offers else None
    flight = flight_offers[0] if flight_offers else None
    pickup_time = _transfer_pickup_time(request, flight)
    dropoff_label = hotel.name if hotel else request.travel_details.meeting_location or "Hotel or meeting location"
    dropoff_address = hotel.address if hotel else request.travel_details.meeting_location or request.preferences.preferred_hotel_area
    passengers = request.travel_details.travelers
    offers: list[CorporateGroundTransferOffer] = []
    for index, estimate in enumerate(estimates[:CORPORATE_REVIEW_OPTION_COUNT]):
        amount_usd = _amount_to_usd(estimate.amount, estimate.currency)
        display_estimate = _converted_uber_display(amount_usd, request)
        notes = [
            item for item in [
                f"Uber product ID: {estimate.product_id}" if estimate.product_id else "",
                f"Display estimate: {display_estimate}" if display_estimate else "",
                f"Pickup estimate: {estimate.pickup_minutes} minute(s)" if estimate.pickup_minutes is not None else "",
                f"Trip duration: {estimate.duration_minutes} minute(s)" if estimate.duration_minutes is not None else "",
                "Source: Uber live ride estimate",
                "Verify Uber product availability at booking time.",
            ] if item
        ]
        offers.append(
            CorporateGroundTransferOffer(
                id=f"transfer_uber_{uuid_suffix(request.id, estimate.product_id or estimate.name, str(index))}",
                provider="Uber",
                offer_id=estimate.product_id,
                pickup_airport_code=airport,
                pickup_time=pickup_time,
                dropoff_label=dropoff_label,
                dropoff_address=dropoff_address,
                service_type="PRIVATE",
                vehicle_type=estimate.name,
                passengers=passengers,
                baggage=_uber_baggage_note(estimate.name, passengers),
                total_amount=max(int(round(amount_usd)), 1),
                currency="USD",
                cancellation_notes="Uber cancellation and wait-time rules must be reviewed before any ride request.",
                source="uber",
                notes=notes,
            )
        )
    return offers


class _UberEstimate:
    def __init__(
        self,
        *,
        product_id: str | None,
        name: str,
        amount: float,
        currency: str,
        pickup_minutes: int | None,
        duration_minutes: int | None,
    ) -> None:
        self.product_id = product_id
        self.name = name
        self.amount = amount
        self.currency = currency
        self.pickup_minutes = pickup_minutes
        self.duration_minutes = duration_minutes


def _uber_estimates(token: str, pickup: tuple[float, float], dropoff: tuple[float, float]) -> list[_UberEstimate]:
    estimates = _uber_guest_trip_estimates(token, pickup, dropoff)
    if estimates:
        return estimates
    return _uber_legacy_price_estimates(token, pickup, dropoff)


def _uber_guest_trip_estimates(token: str, pickup: tuple[float, float], dropoff: tuple[float, float]) -> list[_UberEstimate]:
    import httpx

    base_url = os.getenv("UBER_API_BASE_URL", "https://test-api.uber.com").rstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    organization_uuid = os.getenv("UBER_ORGANIZATION_UUID")
    if organization_uuid:
        headers["x-uber-organizationuuid"] = organization_uuid
    response = httpx.post(
        f"{base_url}/v1/guests/trips/estimates",
        headers=headers,
        json={
            "pickup": {"latitude": pickup[0], "longitude": pickup[1]},
            "dropoff": {"latitude": dropoff[0], "longitude": dropoff[1]},
        },
        timeout=_provider_timeout(),
    )
    if response.status_code in {404, 405}:
        return []
    response.raise_for_status()
    payload = response.json()
    if payload.get("fares_unavailable"):
        return []
    return _map_uber_guest_estimates(payload)


def _uber_legacy_price_estimates(token: str, pickup: tuple[float, float], dropoff: tuple[float, float]) -> list[_UberEstimate]:
    import httpx

    base_url = os.getenv("UBER_API_BASE_URL", "https://test-api.uber.com").rstrip("/")
    response = httpx.get(
        f"{base_url}/v1.2/estimates/price",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "start_latitude": pickup[0],
            "start_longitude": pickup[1],
            "end_latitude": dropoff[0],
            "end_longitude": dropoff[1],
        },
        timeout=_provider_timeout(),
    )
    response.raise_for_status()
    return _map_uber_legacy_estimates(response.json())


def _map_uber_guest_estimates(payload: dict[str, Any]) -> list[_UberEstimate]:
    raw_estimates = payload.get("product_estimates")
    if not isinstance(raw_estimates, list):
        return []
    estimates: list[_UberEstimate] = []
    for item in raw_estimates:
        if not isinstance(item, dict):
            continue
        product = item.get("product") if isinstance(item.get("product"), dict) else {}
        estimate_info = item.get("estimate_info") if isinstance(item.get("estimate_info"), dict) else {}
        fare = estimate_info.get("fare") if isinstance(estimate_info.get("fare"), dict) else {}
        if not fare:
            fare = estimate_info.get("estimate") if isinstance(estimate_info.get("estimate"), dict) else {}
        if item.get("no_cars_available") or estimate_info.get("no_cars_available") or not fare:
            continue
        amount = _estimate_amount(fare)
        currency = str(fare.get("currency_code") or "USD").upper()
        if amount is None:
            continue
        estimates.append(
            _UberEstimate(
                product_id=_string_or_none(product.get("product_id")),
                name=str(product.get("display_name") or product.get("short_description") or "Uber ride").strip(),
                amount=amount,
                currency=currency,
                pickup_minutes=_int_or_none(estimate_info.get("pickup_estimate")),
                duration_minutes=_seconds_to_minutes(_nested_get(estimate_info, ["trip", "duration_estimate"])),
            )
        )
    return estimates


def _map_uber_legacy_estimates(payload: dict[str, Any]) -> list[_UberEstimate]:
    raw_estimates = payload.get("prices") or payload.get("products") or payload.get("product_estimates")
    if not isinstance(raw_estimates, list):
        return []
    estimates: list[_UberEstimate] = []
    for item in raw_estimates:
        if not isinstance(item, dict):
            continue
        amount = _estimate_amount(item)
        currency = str(item.get("currency_code") or item.get("currency") or "USD").upper()
        if amount is None:
            continue
        duration = _int_or_none(item.get("duration"))
        estimates.append(
            _UberEstimate(
                product_id=_string_or_none(item.get("product_id")),
                name=str(item.get("display_name") or item.get("localized_display_name") or "Uber ride").strip(),
                amount=amount,
                currency=currency,
                pickup_minutes=_int_or_none(item.get("pickup_estimate")),
                duration_minutes=_seconds_to_minutes(duration),
            )
        )
    return estimates


def _uber_access_token() -> str | None:
    token = os.getenv("UBER_ACCESS_TOKEN")
    if token:
        return token
    auth_code = os.getenv("UBER_AUTH_CODE")
    redirect_uri = os.getenv("UBER_REDIRECT_URI")
    if not auth_code or not redirect_uri:
        return None
    try:
        return _exchange_uber_authorization_code(auth_code, redirect_uri)
    except Exception as exc:
        log_internal_issue(
            logging.getLogger(INTERNAL_LOGGER_NAME),
            "uber.oauth.unavailable",
            "Uber OAuth token exchange failed.",
            error=exc,
            provider="uber",
        )
        return None


def _exchange_uber_authorization_code(auth_code: str, redirect_uri: str) -> str | None:
    import httpx

    response = httpx.post(
        f"{_uber_auth_base_url()}/oauth/v2/token",
        data={
            "scope": os.getenv("UBER_SCOPES", UBER_GUEST_RIDES_SCOPE),
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code": auth_code,
            "client_assertion": _uber_client_assertion(),
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        },
        timeout=_provider_timeout(),
    )
    response.raise_for_status()
    payload = response.json()
    return _string_or_none(payload.get("access_token"))


def _uber_client_assertion() -> str:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    key_file = os.getenv("UBER_ASYMMETRIC_KEY_FILE")
    if not key_file:
        raise RuntimeError("Uber asymmetric key file is not configured")
    payload = json.loads(open(key_file, encoding="utf-8").read())
    client_id = str(payload["application_id"])
    key_id = str(payload["key_id"])
    private_key_text = str(payload["private_key"]).replace("\\n", "\n").encode("utf-8")
    private_key = serialization.load_pem_private_key(private_key_text, password=None)
    header = {"alg": "RS256", "typ": "JWT", "kid": key_id}
    claims = {
        "iss": client_id,
        "sub": client_id,
        "aud": "auth.uber.com",
        "jti": str(uuid4()),
        "exp": int(time.time()) + 3600,
    }
    signing_input = ".".join([
        _base64url(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        _base64url(json.dumps(claims, separators=(",", ":")).encode("utf-8")),
    ]).encode("ascii")
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input.decode('ascii')}.{_base64url(signature)}"


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _uber_auth_base_url() -> str:
    return os.getenv("UBER_AUTH_BASE_URL", "https://sandbox-login.uber.com").rstrip("/")


def _uber_transfer_coordinates(
    request: CorporateTravelRequest,
    hotel: CorporateHotelOffer | None,
) -> tuple[tuple[float, float] | None, tuple[float, float] | None]:
    airport = _transfer_airport_code(request)
    pickup = AIRPORT_COORDINATES.get(airport)
    dropoff = _configured_transfer_coordinates(hotel.address if hotel else None)
    dropoff = dropoff or _configured_transfer_coordinates(hotel.name if hotel else None)
    dropoff = dropoff or _configured_transfer_coordinates(request.travel_details.meeting_location)
    dropoff = dropoff or _configured_transfer_coordinates(request.preferences.preferred_hotel_area)
    dropoff = dropoff or _configured_transfer_coordinates(request.travel_details.destination)
    return pickup, dropoff


def _configured_transfer_coordinates(value: str | None) -> tuple[float, float] | None:
    if not value:
        return None
    configured = _transfer_coordinates_from_env(value)
    if configured:
        return configured
    text = _norm(value)
    for key, coordinates in TRANSFER_LOCATION_COORDINATES.items():
        if key in text:
            return coordinates
    return None


def _transfer_coordinates_from_env(value: str) -> tuple[float, float] | None:
    raw = os.getenv("TRAVEL_AI_TRANSFER_COORDINATES")
    if not raw:
        return None
    try:
        configured = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(configured, dict):
        return None
    for key in {value, _norm(value)}:
        coordinates = configured.get(key)
        if isinstance(coordinates, list) and len(coordinates) == 2:
            lat = _money_float(coordinates[0])
            lon = _money_float(coordinates[1])
            if lat is not None and lon is not None:
                return lat, lon
    return None


def _amount_to_usd(amount: float, currency: str) -> float:
    source = currency.upper()
    if source == "USD":
        return amount
    rate = PLANNING_RATES.get(cast(SupportedCurrency, source))
    if not rate:
        return amount
    return amount / rate


def _offer_amount_usd(amount: float, currency: str | None) -> float:
    return _amount_to_usd(max(float(amount or 0), 0), currency or "USD")


def _converted_uber_display(amount_usd: float, request: CorporateTravelRequest) -> str | None:
    target_currency = _planning_currency(request)
    if target_currency == "USD":
        return None
    converted = convert_planning_amount(int(round(amount_usd)), "USD", target_currency)
    return f"about {format_currency_amount(converted, target_currency)}"


def _uber_baggage_note(name: str, passengers: int) -> str:
    lowered = name.lower()
    if "xl" in lowered or "van" in lowered:
        return f"High-capacity Uber option for {passengers} passenger(s) and extra luggage"
    if "black" in lowered or "premium" in lowered:
        return "Premium Uber option; luggage fit must be confirmed before request"
    return "Standard Uber luggage capacity; confirm if carrying oversized bags"


def _seconds_to_minutes(value: object) -> int | None:
    seconds = _int_or_none(value)
    if seconds is None:
        return None
    return max(1, int(round(seconds / 60)))


def _money_float(value: object) -> float | None:
    if value is None:
        return None
    match = re.search(r"\d[\d,]*(?:\.\d+)?", str(value))
    if not match:
        return None
    return float(match.group(0).replace(",", ""))


def _estimate_amount(value: dict[str, Any]) -> float | None:
    low = _money_float(value.get("low_estimate"))
    high = _money_float(value.get("high_estimate"))
    if low is not None and high is not None:
        return (low + high) / 2
    return _money_float(
        value.get("value")
        or value.get("estimate")
        or value.get("display")
        or value.get("display_estimate")
        or value.get("high_estimate")
        or value.get("localized_display_name")
    )


def _hotel_address_from_notes(notes: list[str]) -> str | None:
    for note in notes:
        lowered = note.lower()
        if (
            note
            and "source:" not in lowered
            and "booking link:" not in lowered
            and "photo url:" not in lowered
            and "accommodation id:" not in lowered
            and "review " not in lowered
            and "-star" not in lowered
            and "/ night" not in lowered
        ):
            return note
    return None


def _hotel_star_from_notes(notes: list[str]) -> float | None:
    for note in notes:
        if "-star" in note:
            try:
                return float(note.split("-star", 1)[0].strip())
            except ValueError:
                return None
    return None


def _hotel_star_from_preference(value: str | None) -> float | None:
    if not value:
        return None
    for token in value.replace("+", " ").split():
        try:
            return float(token)
        except ValueError:
            continue
    return None


def _leg_summary(leg: FlightLeg) -> str:
    route = " -> ".join(_unique_nonempty_text([leg.origin, *leg.connection_airports, leg.destination]))
    stops = f"{leg.stops} stop(s)" if leg.stops is not None else "stops pending"
    if leg.connection_airports:
        stops = f"{stops} via {', '.join(leg.connection_airports)}"
    layover = f" · {leg.layover_summary}" if leg.layover_summary else ""
    timing = ""
    if leg.departure_at or leg.arrival_at:
        timing = f" · {leg.departure_at or 'departure pending'} to {leg.arrival_at or 'arrival pending'}"
    carrier = f" · {leg.airline}" if leg.airline else ""
    return f"{route}{carrier} · {stops}{layover}{timing}"


def _unique_nonempty_text(items: list[str | None]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for item in items:
        value = (item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _source_offer_id(offer: Offer) -> str:
    return _note_value(offer.notes, "Offer ID:") or offer.id


def _airline_from_offer(offer: Offer) -> str:
    leg_airlines = _unique_nonempty_text([
        leg.airline
        for leg in offer.flight_legs
        if leg.airline and "planning estimate" not in leg.airline.lower()
    ])
    if leg_airlines:
        return " + ".join(leg_airlines)
    if offer.provider.startswith(("manual-sourcing-required", "synthetic-duffel/")):
        return "Airline to confirm"
    return offer.title.split("·", 1)[0].strip() or "Airline to confirm"


def _note_value(notes: list[str], prefix: str) -> str | None:
    for note in notes:
        if note.startswith(prefix):
            return note.removeprefix(prefix).strip()
    return None


def uuid_suffix(*parts: str | None) -> str:
    text = "-".join(part or "" for part in parts)
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def _corporate_options(
    request: CorporateTravelRequest,
    nights: int,
    flight_offers: list[CorporateFlightOffer],
    hotel_offers: list[CorporateHotelOffer] | None = None,
    ground_transfer_offers: list[CorporateGroundTransferOffer] | None = None,
) -> list[TravelOption]:
    flight_base = _corporate_flight_estimate(request)
    hotel_base = _corporate_hotel_estimate(request, nights)
    include_transfer = request.travel_details.include_ground_transfer
    transfer_base = _corporate_transfer_estimate(request) if include_transfer else 0
    cabin = request.travel_details.cabin.replace("_", " ")
    destination = request.travel_details.destination or "destination"
    airline = request.preferences.preferred_airline or "major carrier"
    hotel = request.preferences.hotel_preference or "business hotel"
    hotel_offers = hotel_offers or []
    ground_transfer_offers = ground_transfer_offers or []
    budget_flights = sorted(flight_offers, key=lambda offer: _offer_amount_usd(offer.total_amount, offer.currency))
    budget_hotels = sorted(hotel_offers, key=lambda offer: _offer_amount_usd(offer.total_amount, offer.currency))
    budget_transfers = sorted(ground_transfer_offers, key=lambda offer: _offer_amount_usd(offer.total_amount, offer.currency))
    option_flights = _recommendation_flights(request, flight_offers, budget_flights)
    best_flight = option_flights[0] if option_flights else None
    fastest_flight = option_flights[1] if len(option_flights) > 1 else None
    comfort_flight = option_flights[2] if len(option_flights) > 2 else None
    best_hotel = budget_hotels[0] if budget_hotels else None
    fastest_hotel = hotel_offers[1] if len(hotel_offers) > 1 else best_hotel
    comfort_hotel = hotel_offers[2] if len(hotel_offers) > 2 else (fastest_hotel or best_hotel)
    best_transfer = budget_transfers[0] if budget_transfers else None
    fastest_transfer = ground_transfer_offers[1] if len(ground_transfer_offers) > 1 else best_transfer
    comfort_transfer = ground_transfer_offers[2] if len(ground_transfer_offers) > 2 else (fastest_transfer or best_transfer)
    best_flight_cost = _offer_amount_usd(best_flight.total_amount, best_flight.currency) if best_flight else int(flight_base * 0.92)
    fastest_flight_cost = _offer_amount_usd(fastest_flight.total_amount, fastest_flight.currency) if fastest_flight else int(flight_base * 1.12)
    comfort_flight_cost = _offer_amount_usd(comfort_flight.total_amount, comfort_flight.currency) if comfort_flight else int(flight_base * 1.3)
    best_hotel_cost = _offer_amount_usd(best_hotel.total_amount, best_hotel.currency) if best_hotel else hotel_base
    fastest_hotel_cost = _offer_amount_usd(fastest_hotel.total_amount, fastest_hotel.currency) if fastest_hotel else int(hotel_base * 1.05)
    comfort_hotel_cost = _offer_amount_usd(comfort_hotel.total_amount, comfort_hotel.currency) if comfort_hotel else int(hotel_base * 1.18)
    best_transfer_cost = _offer_amount_usd(best_transfer.total_amount, best_transfer.currency) if best_transfer else transfer_base
    fastest_transfer_cost = _offer_amount_usd(fastest_transfer.total_amount, fastest_transfer.currency) if fastest_transfer else (int(transfer_base * 1.2) if include_transfer else 0)
    comfort_transfer_cost = _offer_amount_usd(comfort_transfer.total_amount, comfort_transfer.currency) if comfort_transfer else (int(transfer_base * 1.45) if include_transfer else 0)
    best_cost = _convert_planning_cost(best_flight_cost + best_hotel_cost + best_transfer_cost, request)
    fastest_cost = _convert_planning_cost(fastest_flight_cost + fastest_hotel_cost + fastest_transfer_cost, request)
    comfort_cost = _convert_planning_cost(comfort_flight_cost + comfort_hotel_cost + comfort_transfer_cost, request)
    best_flight_summary = _flight_summary_for_components(request, best_flight.summary if best_flight else f"Round-trip {cabin} routing to {destination} on a cost-controlled {airline} option.")
    fastest_flight_summary = _flight_summary_for_components(request, fastest_flight.summary if fastest_flight else f"Fastest practical {cabin} routing to {destination} with fewer or shorter connections.")
    comfort_flight_summary = _flight_summary_for_components(request, comfort_flight.summary if comfort_flight else f"Comfort-optimized {cabin} routing with better connection buffers.")
    best_hotel_summary = _hotel_summary_for_components(request, _corporate_hotel_summary(best_hotel, hotel, nights, "standard business amenities"))
    fastest_hotel_summary = _hotel_summary_for_components(request, _corporate_hotel_summary(fastest_hotel, hotel, nights, "close to the primary business area"))
    comfort_hotel_summary = _hotel_summary_for_components(request, _corporate_hotel_summary(comfort_hotel, f"Upgraded {hotel} option", nights, "stronger rest and work amenities"))
    best_transfer_summary = _transfer_summary_for_components(request, _corporate_transfer_summary(best_transfer, "Standard private airport transfer"))
    fastest_transfer_summary = _transfer_summary_for_components(request, _corporate_transfer_summary(fastest_transfer, "Priority airport pickup transfer"))
    comfort_transfer_summary = _transfer_summary_for_components(request, _corporate_transfer_summary(comfort_transfer, "Executive airport transfer"))
    options = [
        TravelOption(
            option_name="Best tier fit",
            flight_offer_id=best_flight.id if best_flight else None,
            ground_transfer_offer_id=best_transfer.id if best_transfer else None,
            flight_summary=best_flight_summary,
            hotel_summary=best_hotel_summary,
            transfer_summary=best_transfer_summary,
            estimated_cost=best_cost,
            pros=["Lowest estimated total", "Balanced schedule", "Best first option for band-tier review"],
            cons=["May include one connection", "Seat and fare class need confirmation before final confirmation"],
            policy_status="Compliant pending document review",
            recommendation_reason="Best balance of cost, schedule, hotel tier, ground transfer coverage, and corporate policy.",
        ),
        TravelOption(
            option_name="Fastest route",
            flight_offer_id=fastest_flight.id if fastest_flight else None,
            ground_transfer_offer_id=fastest_transfer.id if fastest_transfer else None,
            flight_summary=fastest_flight_summary,
            hotel_summary=fastest_hotel_summary,
            transfer_summary=fastest_transfer_summary,
            estimated_cost=fastest_cost,
            pros=["Shortest travel time", "Lower disruption risk"],
            cons=["Higher fare estimate", "Availability needs confirmation before final confirmation"],
            policy_status="Compliant pending document review",
            recommendation_reason="Use when schedule certainty matters more than lowest fare.",
        ),
        TravelOption(
            option_name="Comfort-focused option",
            flight_offer_id=comfort_flight.id if comfort_flight else None,
            ground_transfer_offer_id=comfort_transfer.id if comfort_transfer else None,
            flight_summary=comfort_flight_summary,
            hotel_summary=comfort_hotel_summary,
            transfer_summary=comfort_transfer_summary,
            estimated_cost=comfort_cost,
            pros=["Better rest profile", "More flexible planning buffers"],
            cons=["Highest estimated cost", "Most likely to require approval"],
            policy_status="Needs approval review",
            recommendation_reason="Use for senior traveler, long-haul fatigue, or high-stakes meeting schedules.",
        ),
    ]
    if request.travel_details.include_outbound_flight or request.travel_details.include_return_flight:
        return options[:max(1, len(option_flights))]
    return options[:1]


def _recommendation_flights(
    request: CorporateTravelRequest,
    flight_offers: list[CorporateFlightOffer],
    budget_flights: list[CorporateFlightOffer],
) -> list[CorporateFlightOffer]:
    if not (request.travel_details.include_outbound_flight or request.travel_details.include_return_flight):
        return []
    distinct_flights = _distinct_flight_offers(flight_offers)
    if len(distinct_flights) <= 1:
        return distinct_flights
    selected: list[CorporateFlightOffer] = []
    cheapest = next((offer for offer in budget_flights if offer in distinct_flights), distinct_flights[0])
    selected.append(cheapest)
    fastest = min(distinct_flights, key=_flight_elapsed_sort_key)
    if fastest not in selected:
        selected.append(fastest)
    for offer in distinct_flights:
        if offer not in selected:
            selected.append(offer)
        if len(selected) == CORPORATE_REVIEW_OPTION_COUNT:
            break
    return selected[:CORPORATE_REVIEW_OPTION_COUNT]


def _distinct_flight_offers(flight_offers: list[CorporateFlightOffer]) -> list[CorporateFlightOffer]:
    distinct: list[CorporateFlightOffer] = []
    signatures: set[str] = set()
    for offer in flight_offers:
        signature = _flight_offer_signature(offer)
        if signature in signatures:
            continue
        signatures.add(signature)
        distinct.append(offer)
    return distinct[:CORPORATE_REVIEW_OPTION_COUNT]


def _flight_offer_signature(offer: CorporateFlightOffer) -> str:
    return "|".join([
        offer.airline.strip().lower(),
        offer.outbound.strip().lower(),
        (offer.return_leg or "").strip().lower(),
    ])


def _flight_elapsed_sort_key(offer: CorporateFlightOffer) -> tuple[int, int]:
    minutes = _flight_elapsed_minutes(offer)
    if minutes is None:
        return (1, int(_offer_amount_usd(offer.total_amount, offer.currency)))
    return (0, minutes)


def _flight_elapsed_minutes(offer: CorporateFlightOffer) -> int | None:
    total = 0
    legs = [offer.outbound, offer.return_leg or ""]
    for leg in legs:
        timestamps = ISO_DATETIME_PATTERN.findall(leg)
        if len(timestamps) < 2:
            continue
        try:
            departure = datetime.fromisoformat(timestamps[0])
            arrival = datetime.fromisoformat(timestamps[-1])
        except ValueError:
            continue
        total += max(int((arrival - departure).total_seconds() // 60), 0)
    return total or None


def _corporate_hotel_summary(offer: Offer | CorporateHotelOffer | None, fallback: str, nights: int, qualifier: str) -> str:
    if not offer:
        return f"{fallback} for {nights} night(s) with {qualifier}."
    if isinstance(offer, CorporateHotelOffer):
        return f"{offer.name} for {nights} night(s), estimated {offer.total_amount} {offer.currency}."
    return f"{offer.title} for {nights} night(s), estimated {offer.price_usd} {offer.currency}."


def _corporate_transfer_summary(offer: CorporateGroundTransferOffer | None, fallback: str) -> str:
    if not offer:
        return f"{fallback}; provider confirmation required before pickup."
    pickup_time = f" at {offer.pickup_time}" if offer.pickup_time else ""
    vehicle = f" in {offer.vehicle_type}" if offer.vehicle_type else ""
    estimate = f"{offer.total_amount} {offer.currency}"
    display_estimate = _note_value(offer.notes, "Display estimate:")
    if display_estimate:
        estimate = f"{estimate} ({display_estimate})"
    return (
        f"{offer.service_type.title()} transfer from {offer.pickup_airport_code} to {offer.dropoff_label}"
        f"{pickup_time}{vehicle}, estimated {estimate}."
    )


def _component_summary(request: CorporateTravelRequest) -> str:
    travel = request.travel_details
    included = []
    skipped = []
    for enabled, label in (
        (travel.include_outbound_flight, "outbound flight"),
        (travel.include_return_flight, "return flight"),
        (travel.include_hotel, "hotel"),
        (travel.include_ground_transfer, "airport transfer"),
    ):
        (included if enabled else skipped).append(label)
    included_text = ", ".join(included) if included else "no travel components"
    if not skipped:
        return included_text
    return f"{included_text}; skipped {', '.join(skipped)}"


def _flight_summary_for_components(request: CorporateTravelRequest, fallback: str) -> str:
    travel = request.travel_details
    if not travel.include_outbound_flight and not travel.include_return_flight:
        return "Flights excluded by request form."
    if not travel.include_outbound_flight:
        return f"Outbound flight excluded by request form. Return flight planned from {travel.destination or 'destination'} to {travel.origin or 'origin'}."
    if not travel.include_return_flight:
        return f"{fallback} Return flight excluded by request form."
    return fallback


def _hotel_summary_for_components(request: CorporateTravelRequest, fallback: str) -> str:
    if not request.travel_details.include_hotel:
        return "Hotel excluded by request form."
    return fallback


def _transfer_summary_for_components(request: CorporateTravelRequest, fallback: str) -> str:
    if not request.travel_details.include_ground_transfer:
        return "Airport transfer excluded by request."
    return fallback


def _planning_currency(request: CorporateTravelRequest) -> SupportedCurrency:
    currency = str(request.budgets.currency or "USD").upper()
    if currency in SUPPORTED_BUDGET_CURRENCIES:
        return cast(SupportedCurrency, currency)
    return "USD"


def _convert_planning_cost(amount_usd: float, request: CorporateTravelRequest) -> int:
    currency = _planning_currency(request)
    if currency == "USD":
        return int(amount_usd)
    return convert_planning_amount(max(int(amount_usd), 0), "USD", currency)


def _planning_currency_amount(amount_usd: int, request: CorporateTravelRequest) -> tuple[int, str]:
    currency = _planning_currency(request)
    return _convert_planning_cost(amount_usd, request), currency


def _currency_conversion_note(request: CorporateTravelRequest) -> str | None:
    currency = _planning_currency(request)
    if currency == "USD":
        return None
    return f"Fast planning currency estimate applied for {currency}; final itinerary totals refresh with live rates when available."


def _corporate_flight_estimate(request: CorporateTravelRequest) -> int:
    if not (request.travel_details.include_outbound_flight or request.travel_details.include_return_flight):
        return 0
    cabin_multiplier = {"economy": 1.0, "premium_economy": 1.35, "business": 2.4, "first": 3.5}[request.travel_details.cabin]
    route_text = _route_text(request)
    long_haul = any(marker in route_text for marker in ("johannesburg", "south africa", "tokyo", "london", "san francisco", "new york"))
    if _is_domestic_india_route(request):
        base = 180
    else:
        base = 1350 if long_haul else 650
    segment_multiplier = 1.0 if (request.travel_details.include_outbound_flight and request.travel_details.include_return_flight) else 0.58
    return int(base * cabin_multiplier * request.travel_details.travelers * segment_multiplier)


def _corporate_hotel_estimate(request: CorporateTravelRequest, nights: int) -> int:
    if not request.travel_details.include_hotel:
        return 0
    destination = _norm(request.travel_details.destination)
    country = _norm(request.travel_details.destination_country)
    if _destination_is_india(request):
        return 110 * nights
    nightly = 185 if "johannesburg" in destination or "south africa" in country else 160
    return nightly * nights


def _corporate_transfer_estimate(request: CorporateTravelRequest) -> int:
    if not request.travel_details.include_ground_transfer:
        return 0
    destination = _norm(request.travel_details.destination)
    country = _norm(request.travel_details.destination_country)
    if _destination_is_india(request):
        return 35 * max(request.travel_details.travelers, 1)
    base = 85 if "johannesburg" in destination or "south africa" in country else 70
    return base * max(request.travel_details.travelers, 1)


def _route_text(request: CorporateTravelRequest) -> str:
    return " ".join(
        _norm(value)
        for value in (
            request.travel_details.origin,
            request.travel_details.destination,
            request.travel_details.destination_country,
        )
        if value
    )


def _destination_is_india(request: CorporateTravelRequest) -> bool:
    destination = _norm(request.travel_details.destination)
    country = _norm(request.travel_details.destination_country)
    return country == "india" or destination in INDIA_ROUTE_KEYS


def _is_domestic_india_route(request: CorporateTravelRequest) -> bool:
    origin = _norm(request.travel_details.origin)
    destination = _norm(request.travel_details.destination)
    country = _norm(request.travel_details.destination_country)
    if country == "india" and (origin in INDIA_ROUTE_KEYS or destination in INDIA_ROUTE_KEYS):
        return True
    return origin in INDIA_ROUTE_KEYS and destination in INDIA_ROUTE_KEYS


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
        transit_warning="Transit requirements were not verified and need review before final travel confirmation.",
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
    policy_violations = _policy_violations(request, estimated_cost, policy_rows)
    if policy_violations:
        policy_status = "Policy Violation"
    else:
        policy_status = "Compliant"
    for option in options:
        option.policy_status = _travel_option_policy_status(request, option.estimated_cost, policy_rows)
    approval_required = bool(policy_violations)
    reasons = []
    reasons.extend(policy_violations)
    return BudgetPolicyCheck(
        budget_status="Not Applied",
        policy_status=policy_status,
        approval_required=approval_required,
        approval_reason=" ".join(reasons) if reasons else "No approval required based on available band tier and policy data.",
        total_budget=None,
        estimated_cost=estimated_cost,
    )


def _travel_option_policy_status(request: CorporateTravelRequest, estimated_cost: int, policy_rows: list[dict[str, object]]) -> str:
    policy_violations = _policy_violations(request, estimated_cost, policy_rows)
    if policy_violations:
        return "Policy Violation"
    return "Compliant"


def _policy_violations(request: CorporateTravelRequest, estimated_cost: int, policy_rows: list[dict[str, object]]) -> list[str]:
    violations: list[str] = []
    cabin = request.travel_details.cabin
    for row in policy_rows:
        allowed = row.get("allowed_cabins") or row.get("allowed_cabin") or row.get("cabin")
        if allowed:
            allowed_cap = _highest_cabin(_allowed_cabins_from_text(allowed))
            if allowed_cap and CABIN_RANK[cabin] > CABIN_RANK[allowed_cap]:
                violations.append(f"Requested cabin {cabin.replace('_', ' ')} is outside provided company policy.")
    return violations


def _agent_note(readiness: TravelReadiness, budget_check: BudgetPolicyCheck, missing: list[str]) -> str:
    if missing:
        return "Collect missing request information before moving to approval or final itinerary confirmation."
    if readiness.passport_status == "Blocking Issue" or readiness.visa_status == "Blocking Issue":
        return "Resolve blocking document issues before planning can be finalized."
    if budget_check.approval_required:
        return "Route this request for approval before finalizing the itinerary."
    return "Plan is ready for customer review and itinerary finalization."


def _customer_message(request: CorporateTravelRequest, readiness: TravelReadiness, budget_check: BudgetPolicyCheck) -> str:
    name = request.traveller_details.traveler_name or "there"
    hotel_tier = HOTEL_TIER_LABELS[_hotel_tier_key(request)]
    return (
        f"Hi {name}, I prepared three planning options for your trip. "
        f"Document readiness is {readiness.passport_status}/{readiness.visa_status}, "
        f"and the hotel recommendation follows {hotel_tier}."
    )


def _customer_itinerary(request: CorporateTravelRequest, option: TravelOption, nights: int) -> str:
    origin = request.travel_details.origin or "origin pending"
    destination = request.travel_details.destination or "destination pending"
    depart = request.travel_details.depart_date.isoformat() if request.travel_details.depart_date else "date pending"
    ret = request.travel_details.return_date.isoformat() if request.travel_details.return_date else "return pending"
    segments: list[str] = []
    if request.travel_details.include_outbound_flight:
        segments.append(f"depart {origin} for {destination} on {depart}")
    else:
        segments.append("outbound flight excluded")
    if request.travel_details.include_hotel:
        segments.append(f"stay in {destination} for {nights} night(s)")
    else:
        segments.append("hotel excluded")
    segments.append(option.transfer_summary)
    if request.travel_details.include_return_flight:
        segments.append(f"return on {ret}")
    else:
        segments.append("return flight excluded")
    origin_currency = origin_city_currency(request.travel_details.origin, _planning_currency(request))
    estimated_total = convert_planning_amount(option.estimated_cost, _planning_currency(request), origin_currency)
    return f"{option.option_name}: {', '.join(segments)}. Estimated total: {origin_currency} {estimated_total}."


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


def _elapsed_ms(started_at: float) -> int:
    return max(0, int(round((time.perf_counter() - started_at) * 1000)))


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _provider_timeout() -> float:
    return _float_env("TRAVEL_AI_PROVIDER_TIMEOUT_SECONDS", DEFAULT_PROVIDER_HTTP_TIMEOUT_SECONDS)


def _provider_lookup_timeout() -> float:
    return _float_env("TRAVEL_AI_PROVIDER_LOOKUP_TIMEOUT_SECONDS", DEFAULT_PROVIDER_LOOKUP_TIMEOUT_SECONDS)


def _mcp_timeout() -> float:
    return _float_env("TRAVEL_AI_MCP_TIMEOUT_SECONDS", DEFAULT_MCP_HTTP_TIMEOUT_SECONDS)


def _llm_timeout() -> float:
    return _float_env("TRAVEL_AI_LLM_TIMEOUT_SECONDS", DEFAULT_LLM_HTTP_TIMEOUT_SECONDS)


def _log_corporate_plan_timing(
    request: CorporateTravelRequest,
    stage_times: dict[str, int],
    total_ms: int,
) -> None:
    log_internal_issue(
        logging.getLogger(INTERNAL_LOGGER_NAME),
        "corporate.plan.timing",
        "Corporate travel plan timing.",
        level=logging.WARNING,
        request_id=request.id,
        total_ms=total_ms,
        **stage_times,
    )


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

    if not (flights and hotels):
        mcp_flights, mcp_hotels, mcp_events = _live_mcp_offers(request, actor_id)
        flights = flights or mcp_flights
        hotels = hotels or mcp_hotels
        events.extend(mcp_events)

    if not flights:
        provider_flights, event = _fast_flights_offers(request, actor_id)
        flights = provider_flights
        events.append(event)

    return flights, hotels, events


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
            timeout=_provider_timeout(),
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


def _fast_flights_offers(request: TravelRequest, actor_id: str) -> tuple[list[Offer], AuditEvent]:
    if not _fast_flights_enabled():
        return [], AuditEvent(
            actor_id=actor_id or None,
            event_type="fast_flights.skipped",
            message="fast-flights fallback is disabled.",
        )
    fetch_mode = _fast_flights_fetch_mode()
    search_modes = [fetch_mode]
    if fetch_mode != FAST_FLIGHTS_FALLBACK_FETCH_MODE:
        search_modes.append(FAST_FLIGHTS_FALLBACK_FETCH_MODE)

    last_error: Exception | None = None
    for mode in search_modes:
        try:
            offers = _fast_flights_search(request, mode)
        except Exception as exc:
            last_error = exc
            continue
        if offers:
            return offers, AuditEvent(
                actor_id=actor_id or None,
                event_type="fast_flights.search",
                message=f"fast-flights {mode} mode returned {len(offers)} Google Flights planning estimate(s).",
            )

    if last_error:
        return [], AuditEvent(
            actor_id=actor_id or None,
            event_type="fast_flights.unavailable",
            message=f"fast-flights fallback unavailable: {type(last_error).__name__}.",
        )
    return [], AuditEvent(
        actor_id=actor_id or None,
        event_type="fast_flights.search",
        message="fast-flights fallback returned 0 Google Flights planning estimate(s).",
    )


def _fast_flights_enabled() -> bool:
    return os.getenv("TRAVEL_AI_FAST_FLIGHTS_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}


def _fast_flights_fetch_mode() -> str:
    value = os.getenv("TRAVEL_AI_FAST_FLIGHTS_FETCH_MODE", FAST_FLIGHTS_DEFAULT_FETCH_MODE).strip().lower()
    return value if value in {"common", "fallback", "force-fallback", "local"} else FAST_FLIGHTS_DEFAULT_FETCH_MODE


def _fast_flights_search(request: TravelRequest, fetch_mode: str) -> list[Offer]:
    from fast_flights import FlightData, Passengers, get_flights

    origin = _airport_code_for_fallback(request.origin)
    destination = _airport_code_for_fallback(request.destination)
    passengers = Passengers(adults=max(int(request.travelers or 1), 1))
    seat = _fast_flights_seat(request.cabin)
    outbound_data = [
        FlightData(
            date=request.depart_date.isoformat(),
            from_airport=origin,
            to_airport=destination,
            max_stops=_fast_flights_max_stops(),
        )
    ]
    if request.return_date:
        outbound_result = get_flights(
            flight_data=outbound_data,
            trip="one-way",
            seat=seat,
            passengers=passengers,
            fetch_mode=fetch_mode,
            max_stops=_fast_flights_max_stops(),
        )
        return_result = get_flights(
            flight_data=[
                FlightData(
                    date=request.return_date.isoformat(),
                    from_airport=destination,
                    to_airport=origin,
                    max_stops=_fast_flights_max_stops(),
                )
            ],
            trip="one-way",
            seat=seat,
            passengers=passengers,
            fetch_mode=fetch_mode,
            max_stops=_fast_flights_max_stops(),
        )
        outbound_offers = _map_fast_flights_results(outbound_result, origin, destination, year=request.depart_date.year, direction="outbound")
        return_offers = _map_fast_flights_results(return_result, destination, origin, year=request.return_date.year, direction="return")
        return _combine_fast_flights_round_trip(outbound_offers, return_offers, origin, destination)[:4]

    result = get_flights(
        flight_data=outbound_data,
        trip="one-way",
        seat=seat,
        passengers=passengers,
        fetch_mode=fetch_mode,
        max_stops=_fast_flights_max_stops(),
    )
    return _map_fast_flights_results(result, origin, destination, year=request.depart_date.year, direction="outbound")[:4]


def _fast_flights_max_stops() -> int | None:
    return _int_or_none(os.getenv("TRAVEL_AI_FAST_FLIGHTS_MAX_STOPS"))


def _fast_flights_seat(cabin: str) -> str:
    return cabin.replace("_", "-")


def _airport_code_for_fallback(value: str) -> str:
    clean = value.strip()
    if len(clean) == 3 and clean.isalpha():
        return clean.upper()
    mapped = CITY_IATA.get(_norm(clean))
    if mapped:
        return mapped
    return _resolve_iata(clean, os.getenv("TRAVEL_AI_MCP_TOOLS_URL", "http://127.0.0.1:8083/tools").rstrip("/"))


def _map_fast_flights_results(
    result: Any,
    origin: str,
    destination: str,
    *,
    year: int,
    direction: str,
) -> list[Offer]:
    items = getattr(result, "flights", result)
    if not isinstance(items, list):
        return []
    offers: list[Offer] = []
    for item in items:
        airline = _fast_flights_text(item, "name")
        departure = _fast_flights_text(item, "departure")
        arrival = _fast_flights_text(item, "arrival")
        price_display = _fast_flights_text(item, "price")
        price_usd = _fast_flights_price_usd(price_display)
        if not (airline and departure and arrival and price_usd > 0):
            continue
        stops = _fast_flights_stops(item)
        departure_at = _fast_flights_datetime(departure, year)
        arrival_at = _fast_flights_datetime(arrival, year)
        offers.append(
            Offer(
                kind="flight",
                title=f"{airline} · {origin} -> {destination}",
                provider=FAST_FLIGHTS_PROVIDER,
                price_usd=price_usd,
                currency="USD",
                refundable=False,
                notes=[
                    f"Display estimate: {price_display}",
                    f"Duration: {_fast_flights_text(item, 'duration') or 'not captured'}",
                    f"{stops} stop(s)" if stops is not None else "Stops not captured",
                    "Source: Google Flights planning estimate through fast-flights.",
                    "Manual fare, availability, baggage, and booking confirmation required.",
                ],
                flight_legs=[
                    FlightLeg(
                        direction=cast(Any, direction),
                        origin=origin,
                        destination=destination,
                        departure_at=departure_at or departure,
                        arrival_at=arrival_at or arrival,
                        stops=stops,
                        airline=airline,
                    )
                ],
            )
        )
    return offers


def _combine_fast_flights_round_trip(outbound_offers: list[Offer], return_offers: list[Offer], origin: str, destination: str) -> list[Offer]:
    if not (outbound_offers and return_offers):
        return []
    combined: list[Offer] = []
    for index, outbound in enumerate(outbound_offers[:4]):
        return_offer = return_offers[min(index, len(return_offers) - 1)]
        outbound_leg = outbound.flight_legs[0]
        return_leg = return_offer.flight_legs[0]
        combined.append(
            Offer(
                kind="flight",
                title=f"{outbound_leg.airline} + {return_leg.airline} · {origin} -> {destination} round trip",
                provider=FAST_FLIGHTS_PROVIDER,
                price_usd=outbound.price_usd + return_offer.price_usd,
                currency="USD",
                refundable=False,
                notes=[
                    "Round-trip estimate composed from separate Google Flights one-way searches.",
                    f"Outbound {_fast_flights_prefixed_note(outbound, 'Display estimate:')}",
                    f"Return {_fast_flights_prefixed_note(return_offer, 'Display estimate:')}",
                    f"Outbound {_fast_flights_prefixed_note(outbound, 'Duration:')}",
                    f"Return {_fast_flights_prefixed_note(return_offer, 'Duration:')}",
                    "Source: Google Flights planning estimate through fast-flights.",
                    "Manual fare, availability, baggage, and booking confirmation required.",
                ],
                flight_legs=[outbound_leg, return_leg],
            )
        )
    return combined


def _fast_flights_prefixed_note(offer: Offer, prefix: str) -> str:
    value = _note_value(offer.notes, prefix)
    return f"{prefix} {value}" if value else f"{prefix} not captured"


def _fast_flights_text(item: Any, field: str) -> str:
    if isinstance(item, dict):
        return str(item.get(field) or "").strip()
    return str(getattr(item, field, "") or "").strip()


def _fast_flights_stops(item: Any) -> int | None:
    raw = _fast_flights_text(item, "stops")
    if not raw:
        return None
    return _int_or_none(raw)


def _fast_flights_price_usd(value: str) -> int:
    amount = _fast_flights_money_int(value)
    if amount <= 0:
        return 0
    currency = _fast_flights_currency(value)
    if currency and currency != "USD":
        rate = PLANNING_RATES.get(currency)
        if rate:
            return max(1, int(round(amount / rate)))
    return amount


def _fast_flights_money_int(value: str) -> int:
    match = re.search(r"[\d,.]+", value)
    if not match:
        return 0
    normalized = match.group(0).replace(",", "")
    try:
        return int(round(float(normalized)))
    except ValueError:
        return 0


def _fast_flights_currency(value: str) -> SupportedCurrency | None:
    if "₹" in value:
        return "INR"
    if "$" in value:
        return "USD"
    if "€" in value:
        return "EUR"
    if "£" in value:
        return "GBP"
    if "¥" in value:
        return "JPY"
    return None


def _fast_flights_datetime(value: str, year: int) -> str | None:
    from datetime import datetime

    try:
        parsed = datetime.strptime(f"{value} {year}", "%I:%M %p on %a, %b %d %Y")
        return parsed.isoformat(timespec="seconds")
    except ValueError:
        return None


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
            timeout=_provider_timeout(),
        )
        response.raise_for_status()
        search_payload = response.json()
        photo_by_id = _booking_demand_photo_map(search_payload, base_url)
        hotels = _map_booking_hotels(search_payload, photo_by_id)
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
        locations = httpx.get(f"{base_url}/locations", params={"name": city.lower(), "locale": locale}, headers=headers, timeout=_provider_lookup_timeout())
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
            timeout=_provider_timeout(),
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
    if request.budget_context:
        budget_lines = []
        for item in request.budget_context:
            name = str(item.get("name") or "Plan")
            amount = item.get("estimated_total")
            currency = str(item.get("currency") or "")
            tradeoffs = str(item.get("tradeoffs") or "")
            budget_lines.append(f"{name}: estimated total {amount} {currency}; {tradeoffs}".strip())
        messages.append({"role": "system", "content": f"Plan budget context: {' | '.join(budget_lines)}."})
    if request.source_context:
        selected_flight = request.source_context.get("selected_flight")
        critical_issue = request.source_context.get("critical_issue")
        recovery_mode = bool(request.source_context.get("recovery_mode"))
        upload_summary = str(request.source_context.get("uploaded_form_summary") or "")
        context_lines = []
        if recovery_mode:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "This chat is handling an urgent travel disruption. Prioritize trip recovery and traveler continuity "
                        "over lowest cost: find a viable replacement flight from the same origin when flight travel is affected, "
                        "preserve destination and business purpose, adjust hotel check-in/check-out or nights if the flight dates shift, "
                        "and clearly separate confirmed actions from agent tasks. Do not say a booking is completed unless a real booking confirmation is supplied."
                    ),
                }
            )
        if isinstance(critical_issue, dict):
            context_lines.append(
                "Critical issue: "
                f"{critical_issue.get('status') or 'Urgent'} - {critical_issue.get('issue') or 'travel disruption'}."
            )
        if isinstance(selected_flight, dict):
            context_lines.append(
                "Selected flight: "
                f"{selected_flight.get('airline') or 'airline pending'}; "
                f"{selected_flight.get('outbound') or 'outbound pending'}; "
                f"{selected_flight.get('return_leg') or 'return pending'}; "
                f"{selected_flight.get('total_amount') or 'price pending'} {selected_flight.get('currency') or ''}."
            )
        if upload_summary:
            context_lines.append(f"Uploaded request/form context: {upload_summary[:600]}.")
        if context_lines:
            messages.append({"role": "system", "content": " ".join(context_lines)})

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
            timeout=_llm_timeout(),
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
            timeout=_llm_timeout(),
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
    "bangalore": "BLR",
    "bengaluru": "BLR",
    "blr": "BLR",
    "hyderabad": "HYD",
    "hyd": "HYD",
    "delhi": "DEL",
    "new delhi": "DEL",
    "del": "DEL",
    "johannesburg": "JNB",
    "jnb": "JNB",
    "san francisco": "SFO",
    "sfo": "SFO",
    "new york": "JFK",
    "jfk": "JFK",
    "london": "LHR",
    "lhr": "LHR",
    "mumbai": "BOM",
    "bom": "BOM",
    "chennai": "MAA",
    "maa": "MAA",
    "pune": "PNQ",
    "pnq": "PNQ",
    "kolkata": "CCU",
    "ccu": "CCU",
    "berlin": "BER",
    "ber": "BER",
}

IATA_CITY_NAMES = {
    "BLR": "Bengaluru",
    "HYD": "Hyderabad",
    "DEL": "Delhi",
    "JNB": "Johannesburg",
    "SFO": "San Francisco",
    "JFK": "New York",
    "LHR": "London",
    "BOM": "Mumbai",
    "MAA": "Chennai",
    "PNQ": "Pune",
    "CCU": "Kolkata",
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
        timeout=_provider_lookup_timeout(),
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
                f"Airline code: {owner.get('iata_code')}" if owner.get("iata_code") else "",
                f"Airline logo: {owner.get('logo_symbol_url') or owner.get('logo_lockup_url')}" if owner.get("logo_symbol_url") or owner.get("logo_lockup_url") else "",
                "Source: Duffel API live search",
                "Review fare rules, baggage, and final confirmation requirements.",
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
        segment_items = segments if isinstance(segments, list) else []
        first_segment = segment_items[0] if segment_items else {}
        last_segment = segment_items[-1] if segment_items else {}
        origin = first_segment.get("origin") if isinstance(first_segment.get("origin"), dict) else {}
        destination = last_segment.get("destination") if isinstance(last_segment.get("destination"), dict) else {}
        marketing_carrier = first_segment.get("marketing_carrier") if isinstance(first_segment.get("marketing_carrier"), dict) else {}
        connection_airports = _duffel_connection_airports(segment_items)
        legs.append(
            FlightLeg(
                direction="return" if index == 1 else "outbound",
                origin=str(origin.get("iata_code") or (request.destination if index == 1 else request.origin)).strip(),
                destination=str(destination.get("iata_code") or (request.origin if index == 1 else request.destination)).strip(),
                connection_airports=connection_airports,
                layover_summary=_duffel_layover_summary(segment_items),
                departure_at=_string_or_none(first_segment.get("departing_at") or slice_item.get("departing_at")),
                arrival_at=_string_or_none(last_segment.get("arriving_at") or slice_item.get("arriving_at")),
                stops=max(0, len(segment_items) - 1) + _duffel_technical_stop_count(segment_items) if segment_items else None,
                airline=str(marketing_carrier.get("name") or airline).strip(),
            )
        )
    return legs


def _duffel_connection_airports(segments: list[Any]) -> list[str]:
    codes: list[str] = []
    for segment in segments[1:]:
        if not isinstance(segment, dict):
            continue
        code = _duffel_airport_code(segment.get("origin"))
        if code:
            codes.append(code)
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        stops = segment.get("stops")
        if not isinstance(stops, list):
            continue
        for stop in stops:
            if isinstance(stop, dict):
                code = _duffel_airport_code(stop.get("airport"))
                if code:
                    codes.append(code)
    return _unique_nonempty_text(codes)


def _duffel_layover_summary(segments: list[Any]) -> str | None:
    layovers: list[str] = []
    for index in range(len(segments) - 1):
        current = segments[index]
        next_segment = segments[index + 1]
        if not (isinstance(current, dict) and isinstance(next_segment, dict)):
            continue
        airport = _duffel_airport_code(next_segment.get("origin")) or _duffel_airport_code(current.get("destination"))
        minutes = _connection_minutes(current.get("arriving_at"), next_segment.get("departing_at"))
        if not airport and minutes is None:
            continue
        if airport and minutes is not None:
            layovers.append(f"{airport}: {_format_connection_minutes(minutes)}")
        elif airport:
            layovers.append(f"{airport}: time to confirm")
        elif minutes is not None:
            layovers.append(_format_connection_minutes(minutes))
    if not layovers:
        return None
    return f"Layover {'; '.join(layovers)}"


def _connection_minutes(arrival_value: Any, departure_value: Any) -> int | None:
    arrival = _parse_provider_datetime(arrival_value)
    departure = _parse_provider_datetime(departure_value)
    if not (arrival and departure):
        return None
    minutes = int((departure - arrival).total_seconds() // 60)
    return minutes if minutes > 0 else None


def _parse_provider_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _format_connection_minutes(minutes: int) -> str:
    hours, remaining_minutes = divmod(minutes, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours} hr")
    if remaining_minutes:
        parts.append(f"{remaining_minutes} min")
    return " ".join(parts) or "0 min"


def _duffel_technical_stop_count(segments: list[Any]) -> int:
    count = 0
    for segment in segments:
        if isinstance(segment, dict) and isinstance(segment.get("stops"), list):
            count += len(segment["stops"])
    return count


def _duffel_airport_code(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    code = value.get("iata_code") or value.get("iata_city_code")
    return str(code).strip() if code else None


def _booking_demand_photo_map(payload: Any, base_url: str) -> dict[str, str]:
    hotel_ids = _booking_hotel_ids(payload)
    if not hotel_ids:
        return {}
    import httpx

    try:
        response = httpx.post(
            f"{base_url}/accommodations/details",
            headers=_booking_headers(),
            json={
                "accommodations": hotel_ids[:4],
                "extras": ["photos"],
                "languages": ["en-gb"],
            },
            timeout=_provider_lookup_timeout(),
        )
        response.raise_for_status()
        return _booking_photo_map_from_details(response.json())
    except Exception as exc:
        log_internal_issue(
            logging.getLogger(INTERNAL_LOGGER_NAME),
            "booking.demand.photos.unavailable",
            "Booking.com Demand API hotel photos were unavailable.",
            error=exc,
            provider="booking.com-demand-api",
        )
        return {}


def _booking_hotel_ids(payload: Any) -> list[int]:
    raw_hotels = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(raw_hotels, list):
        return []
    hotel_ids: list[int] = []
    for hotel in raw_hotels[:4]:
        if not isinstance(hotel, dict):
            continue
        hotel_id = _int_or_none(hotel.get("id") or hotel.get("accommodation"))
        if hotel_id is not None:
            hotel_ids.append(hotel_id)
    return hotel_ids


def _booking_photo_map_from_details(payload: Any) -> dict[str, str]:
    raw_hotels = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(raw_hotels, list):
        return {}
    photo_by_id: dict[str, str] = {}
    for hotel in raw_hotels:
        if not isinstance(hotel, dict):
            continue
        hotel_id = str(hotel.get("id") or hotel.get("accommodation") or "").strip()
        photo_url = _booking_photo_url(hotel)
        if hotel_id and photo_url:
            photo_by_id[hotel_id] = photo_url
    return photo_by_id


def _map_booking_hotels(payload: Any, photo_by_id: dict[str, str] | None = None) -> list[Offer]:
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
        hotel_id = str(hotel.get("id") or hotel.get("accommodation") or "").strip()
        photo_url = _booking_photo_url(hotel) or (photo_by_id or {}).get(hotel_id)
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
                        f"Accommodation ID: {hotel_id}" if hotel_id else "",
                        f"Photo URL: {photo_url}" if photo_url else "",
                        "Source: Booking.com Demand API live search",
                        "Availability and cancellation terms must be reviewed before customer confirmation.",
                    ] if item
                ],
            )
        )
    return mapped


def _booking_photo_url(hotel: dict[str, Any]) -> str | None:
    for key in ("photo_url", "max_photo_url", "main_photo_url", "image_url"):
        value = hotel.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    photos = hotel.get("photos") or hotel.get("images")
    if not isinstance(photos, list):
        return None
    sorted_photos = sorted(
        (photo for photo in photos if isinstance(photo, (dict, str))),
        key=lambda photo: not bool(isinstance(photo, dict) and (photo.get("main_photo") or photo.get("main"))),
    )
    for photo in sorted_photos:
        photo_url = _booking_photo_value(photo)
        if photo_url:
            return photo_url
    return None


def _booking_photo_value(photo: dict[str, Any] | str) -> str | None:
    if isinstance(photo, str):
        return photo.strip() or None
    url = photo.get("url")
    if isinstance(url, str) and url.strip():
        return url.strip()
    if isinstance(url, dict):
        for key in ("large", "standard", "thumbnail_large", "thumbnail"):
            value = url.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    for key in ("large_url", "standard_url", "thumbnail_large_url", "thumbnail_url"):
        value = photo.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


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
                        f"Photo URL: {hotel.get('max_photo_url') or hotel.get('main_photo_url') or hotel.get('photo_url')}" if hotel.get("max_photo_url") or hotel.get("main_photo_url") or hotel.get("photo_url") else "",
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
    response = httpx.post(f"{base_url}/{name}", json=clean_payload, timeout=_mcp_timeout())
    response.raise_for_status()
    outer = response.json()
    import json

    if isinstance(outer, dict) and "content" in outer:
        content = outer.get("content")
        first = content[0] if isinstance(content, list) and content else {}
        text = first.get("text", "") if isinstance(first, dict) else ""
        if not text:
            return []
        parsed = json.loads(text)
    else:
        parsed = outer
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
                f"Airline code: {offer.get('airline_iata')}" if offer.get("airline_iata") else "",
                f"Airline logo: {_raw_airline_logo_url(offer)}" if _raw_airline_logo_url(offer) else "",
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


def _raw_airline_logo_url(offer: dict[str, Any]) -> str | None:
    for key in ("airline_logo_url", "logo_symbol_url", "logo_lockup_url", "marketing_carrier_logo_url"):
        value = offer.get(key)
        if value:
            return str(value)
    carrier = offer.get("marketing_carrier")
    if isinstance(carrier, dict):
        value = carrier.get("logo_symbol_url") or carrier.get("logo_lockup_url")
        if value:
            return str(value)
    return None


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
        layover_summary=_string_or_none(leg.get("layover_summary") or leg.get("layover")),
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
                f"Photo URL: {hotel.get('photo_url') or hotel.get('max_photo_url') or hotel.get('main_photo_url')}" if hotel.get("photo_url") or hotel.get("max_photo_url") or hotel.get("main_photo_url") else "",
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
        notes=["Live Duffel results are unavailable. Manual sourcing is required before final price or fare decisions."],
        flight_legs=_fallback_flight_legs(request),
    )


def _fallback_flight_legs(request: TravelRequest) -> list[FlightLeg]:
    legs = [
        FlightLeg(
            direction="outbound",
            origin=request.origin,
            destination=request.destination,
            departure_at=f"{request.depart_date.isoformat()}T{SYNTHETIC_OUTBOUND_DEPARTURE_TIME}",
            arrival_at=f"{request.depart_date.isoformat()}T{SYNTHETIC_OUTBOUND_ARRIVAL_TIME}",
            stops=1,
            airline="Airline to confirm",
        )
    ]
    if request.return_date:
        legs.append(
            FlightLeg(
                direction="return",
                origin=request.destination,
                destination=request.origin,
                departure_at=f"{request.return_date.isoformat()}T{SYNTHETIC_RETURN_DEPARTURE_TIME}",
                arrival_at=f"{request.return_date.isoformat()}T{SYNTHETIC_RETURN_ARRIVAL_TIME}",
                stops=1,
                airline="Airline to confirm",
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
