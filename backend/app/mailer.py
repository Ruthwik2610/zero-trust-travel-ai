import base64
import os
from typing import Any

import httpx

from .models import CorporateTravelRequest, EmailEvent, NotificationRequest


def send_resend_notification(request_id: str, travel_request: CorporateTravelRequest, payload: NotificationRequest, attachment_bytes: bytes | None = None) -> EmailEvent:
    subject = _subject(payload, travel_request)
    if not os.getenv("RESEND_API_KEY") or not os.getenv("RESEND_FROM_EMAIL"):
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            status="configuration_required",
            to=payload.to,
            subject=subject,
            safe_message="Email provider is not configured. Continue with manual follow-up.",
        )

    body: dict[str, Any] = {
        "from": os.environ["RESEND_FROM_EMAIL"],
        "to": payload.to,
        "subject": subject,
        "html": _html_body(payload, travel_request),
        "text": _text_body(payload, travel_request),
        "tags": [
            {"name": "request_id", "value": request_id},
            {"name": "kind", "value": payload.kind},
        ],
    }
    if payload.cc:
        body["cc"] = payload.cc
    if attachment_bytes:
        body["attachments"] = [
            {
                "filename": f"{request_id}-final-itinerary.xlsx",
                "content": base64.b64encode(attachment_bytes).decode("ascii"),
            }
        ]

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
                "Content-Type": "application/json",
                "Idempotency-Key": f"travel-ai/{request_id}/{payload.kind}",
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
        )
    except Exception:
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            status="failed",
            to=payload.to,
            subject=subject,
            safe_message="Email notification could not be sent. Continue with manual follow-up.",
        )


def _subject(payload: NotificationRequest, request: CorporateTravelRequest) -> str:
    traveler = request.traveller_details.traveler_name or "traveler"
    if payload.kind == "approval_request":
        return f"Approval needed for {traveler}'s travel plan"
    if payload.kind == "document_update":
        return f"Document update needed for {traveler}"
    return f"Final itinerary for {traveler}"


def _html_body(payload: NotificationRequest, request: CorporateTravelRequest) -> str:
    route = f"{request.travel_details.origin or 'Origin pending'} to {request.travel_details.destination or 'Destination pending'}"
    note = payload.note or "Please review this corporate travel request."
    return (
        "<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#17201f\">"
        f"<h2>{_subject(payload, request)}</h2>"
        f"<p><strong>Route:</strong> {route}</p>"
        f"<p><strong>Request:</strong> {request.id}</p>"
        f"<p>{note}</p>"
        "<p>No booking, ticketing, or payment has been created by this notification.</p>"
        "</div>"
    )


def _text_body(payload: NotificationRequest, request: CorporateTravelRequest) -> str:
    route = f"{request.travel_details.origin or 'Origin pending'} to {request.travel_details.destination or 'Destination pending'}"
    return "\n".join([
        _subject(payload, request),
        f"Route: {route}",
        f"Request: {request.id}",
        payload.note or "Please review this corporate travel request.",
        "No booking, ticketing, or payment has been created by this notification.",
    ])
