import base64
import html
import os
from typing import Any

import httpx

from .env_loader import load_travel_ai_env
from .models import CorporateTravelRequest, EmailEvent, NotificationRequest
from .security import mask_sensitive_customer_text


def send_resend_notification(
    request_id: str,
    travel_request: CorporateTravelRequest,
    payload: NotificationRequest,
    attachment_bytes: bytes | None = None,
    attachment_filename: str | None = None,
    attachment_content_type: str | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> EmailEvent:
    load_travel_ai_env()
    subject = _subject(payload, travel_request)
    body_text = _safe_email_body(_text_body(payload, travel_request))
    outbound_attachments = list(attachments or [])
    if attachment_bytes:
        outbound_attachments.append((
            attachment_filename or f"{request_id}-final-itinerary.pdf",
            attachment_bytes,
            attachment_content_type or "application/pdf",
        ))
    attachment_names = [filename for filename, _, _ in outbound_attachments]
    if not os.getenv("RESEND_API_KEY") or not os.getenv("RESEND_FROM_EMAIL"):
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            status="configuration_required",
            to=payload.to,
            subject=subject,
            safe_message="Email provider is not configured. Continue with manual follow-up.",
            body_text=body_text,
            attachment_names=attachment_names,
            review_round=payload.review_round,
        )

    body: dict[str, Any] = {
        "from": os.environ["RESEND_FROM_EMAIL"],
        "to": payload.to,
        "subject": subject,
        "html": _html_body(payload, travel_request),
        "text": body_text,
        "tags": [
            {"name": "request_id", "value": request_id},
            {"name": "kind", "value": payload.kind},
            *([{"name": "review_round", "value": str(payload.review_round)}] if payload.review_round is not None else []),
        ],
    }
    if payload.cc:
        body["cc"] = payload.cc
    if outbound_attachments:
        body["attachments"] = [
            {
                "filename": filename,
                "content": base64.b64encode(content).decode("ascii"),
                "content_type": content_type,
            }
            for filename, content, content_type in outbound_attachments
        ]

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
                "Content-Type": "application/json",
                "Idempotency-Key": _idempotency_key(request_id, payload),
            },
            json=body,
            timeout=30.0,
        )
        response.raise_for_status()
        provider_id = str(response.json().get("id") or "")
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            status="sent",
            to=payload.to,
            subject=subject,
            provider_message_id=provider_id,
            safe_message="Email notification was accepted by Resend.",
            body_text=body_text,
            attachment_names=attachment_names,
            review_round=payload.review_round,
        )
    except Exception:
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            status="failed",
            to=payload.to,
            subject=subject,
            safe_message="Email notification could not be sent. Continue with manual follow-up.",
            body_text=body_text,
            attachment_names=attachment_names,
            review_round=payload.review_round,
        )


def _subject(payload: NotificationRequest, request: CorporateTravelRequest) -> str:
    traveler = request.traveller_details.traveler_name or "traveler"
    if payload.kind in {"approval_request", "review_link"}:
        return f"Approval needed for {traveler}'s travel plan"
    if payload.kind == "document_update":
        return f"Document update needed for {traveler}"
    return f"Final itinerary for {traveler}"


def _html_body(payload: NotificationRequest, request: CorporateTravelRequest) -> str:
    route = f"{request.travel_details.origin or 'Origin pending'} to {request.travel_details.destination or 'Destination pending'}"
    note = payload.note or "Please review this corporate travel request."
    review_link = f"<p><a href=\"{html.escape(payload.review_url)}\">Open itinerary review dashboard</a></p>" if payload.review_url else ""
    change_summary = f"<p><strong>What changed:</strong> {html.escape(payload.change_summary)}</p>" if payload.change_summary else ""
    details = _final_itinerary_html(request) if payload.kind == "final_itinerary" else ""
    return (
        "<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#17201f\">"
        f"<h2>{html.escape(_subject(payload, request))}</h2>"
        f"<p><strong>Route:</strong> {html.escape(route)}</p>"
        f"<p><strong>Request:</strong> {html.escape(request.id)}</p>"
        f"<p>{html.escape(note)}</p>"
        f"{review_link}"
        f"{change_summary}"
        f"{details}"
        "<p>No booking, ticketing, or payment has been created by this notification.</p>"
        "</div>"
    )


def _text_body(payload: NotificationRequest, request: CorporateTravelRequest) -> str:
    route = f"{request.travel_details.origin or 'Origin pending'} to {request.travel_details.destination or 'Destination pending'}"
    lines = [
        _subject(payload, request),
        f"Route: {route}",
        f"Request: {request.id}",
        payload.note or "Please review this corporate travel request.",
    ]
    if payload.review_url:
        lines.append(f"Review dashboard: {payload.review_url}")
    if payload.change_summary:
        lines.append(f"What changed: {payload.change_summary}")
    if payload.kind == "final_itinerary":
        detail_lines = _final_itinerary_text_lines(request)
        if detail_lines:
            lines.append("Approved itinerary details:")
            lines.extend(detail_lines)
    lines.append(
        "No booking, ticketing, or payment has been created by this notification.",
    )
    return "\n".join(lines)


def _safe_email_body(value: str) -> str:
    return mask_sensitive_customer_text(value).strip()[:6000]


def _idempotency_key(request_id: str, payload: NotificationRequest) -> str:
    if payload.review_round is None:
        return f"travel-ai/{request_id}/{payload.kind}"
    return f"travel-ai/{request_id}/{payload.kind}/round-{payload.review_round}"


def _final_itinerary_html(request: CorporateTravelRequest) -> str:
    rows = _final_itinerary_rows(request)
    if not rows:
        return ""
    items = "".join(
        f"<li><strong>{html.escape(label)}:</strong> {html.escape(value)}</li>"
        for label, value in rows
    )
    return f"<h3>Approved itinerary details</h3><ul>{items}</ul>"


def _final_itinerary_text_lines(request: CorporateTravelRequest) -> list[str]:
    return [f"{label}: {value}" for label, value in _final_itinerary_rows(request)]


def _final_itinerary_rows(request: CorporateTravelRequest) -> list[tuple[str, str]]:
    plan = request.generated_plan
    if not plan:
        return []

    selected_flight = next((offer for offer in plan.flight_offers if offer.id == plan.selected_flight_offer_id), None)
    selected_hotel = next((offer for offer in plan.hotel_offers if offer.id == plan.selected_hotel_offer_id), None)
    selected_transfer = next((offer for offer in plan.ground_transfer_offers if offer.id == plan.selected_ground_transfer_offer_id), None)
    rows: list[tuple[str, str]] = []

    if selected_flight:
        rows.extend([
            ("Outbound flight", selected_flight.outbound),
            ("Return flight", selected_flight.return_leg or "Not captured"),
            ("Cabin", selected_flight.cabin),
        ])
    if selected_hotel:
        rows.extend([
            ("Hotel", selected_hotel.name),
            ("Hotel address", selected_hotel.address or "Not captured"),
            ("Hotel check-in starts", selected_hotel.check_in_starts_at or "Not captured"),
            ("Hotel checkout time", selected_hotel.checkout_time or "Not captured"),
        ])
    if selected_transfer:
        cab_service = selected_transfer.service_type
        if selected_transfer.vehicle_type:
            cab_service = f"{cab_service} / {selected_transfer.vehicle_type}"
        rows.extend([
            ("Cab service provider", selected_transfer.provider),
            ("Cab service", cab_service),
            ("Cab pickup", f"{selected_transfer.pickup_airport_code} at {selected_transfer.pickup_time or 'time pending'}"),
            ("Cab dropoff", f"{selected_transfer.dropoff_label} ({selected_transfer.dropoff_address or 'address pending'})"),
        ])
    rows.append(("Estimated cost", f"{plan.budget_policy_check.estimated_cost} {request.budgets.currency or 'USD'}"))
    return rows
