import base64
from email.message import EmailMessage
import html
import logging
import os
import smtplib
import ssl
from typing import Any

import httpx

from .currency import convert_final_amount, origin_city_currency
from .env_loader import load_travel_ai_env
from .internal_logger import INTERNAL_LOGGER_NAME, log_internal_issue
from .models import CorporateTravelRequest, EmailEvent, NotificationRequest
from .security import mask_sensitive_customer_text

SMTP_DEFAULT_PORT = 587


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
    body_html = _html_body(payload, travel_request)
    outbound_attachments = list(attachments or [])
    if attachment_bytes:
        outbound_attachments.append((
            attachment_filename or f"{request_id}-final-itinerary.pdf",
            attachment_bytes,
            attachment_content_type or "application/pdf",
        ))
    attachment_names = [filename for filename, _, _ in outbound_attachments]
    if not _resend_configured() and not _smtp_configured():
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

    if not _resend_configured():
        return _send_smtp_notification(
            request_id,
            payload,
            subject,
            body_text,
            body_html,
            outbound_attachments,
            "Email notification was sent through SMTP.",
        )

    body: dict[str, Any] = {
        "from": os.environ["RESEND_FROM_EMAIL"],
        "to": payload.to,
        "subject": subject,
        "html": body_html,
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
    except Exception as exc:
        log_internal_issue(
            logging.getLogger(INTERNAL_LOGGER_NAME),
            "email.resend.send_failed",
            "Resend email send failed.",
            error=exc,
            provider="resend",
            request_id=request_id,
            kind=payload.kind,
            from_domain=_email_domain(os.environ["RESEND_FROM_EMAIL"]),
            recipient_domains=[_email_domain(recipient) for recipient in payload.to],
        )
        if _smtp_configured():
            return _send_smtp_notification(
                request_id,
                payload,
                subject,
                body_text,
                body_html,
                outbound_attachments,
                "Email notification was sent through SMTP fallback after Resend rejected the send.",
                resend_error=exc,
            )
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            status="failed",
            to=payload.to,
            subject=subject,
            safe_message=_send_failure_message(exc, os.environ["RESEND_FROM_EMAIL"]),
            body_text=body_text,
            attachment_names=attachment_names,
            review_round=payload.review_round,
        )


def _resend_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY") and os.getenv("RESEND_FROM_EMAIL"))


def _smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and _smtp_from_email())


def _send_smtp_notification(
    request_id: str,
    payload: NotificationRequest,
    subject: str,
    body_text: str,
    body_html: str,
    attachments: list[tuple[str, bytes, str]],
    success_message: str,
    resend_error: Exception | None = None,
) -> EmailEvent:
    attachment_names = [filename for filename, _, _ in attachments]
    try:
        _send_smtp_message(payload, subject, body_text, body_html, attachments)
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            provider="smtp",
            status="sent",
            to=payload.to,
            subject=subject,
            safe_message=success_message,
            body_text=body_text,
            attachment_names=attachment_names,
            review_round=payload.review_round,
        )
    except Exception as exc:
        log_internal_issue(
            logging.getLogger(INTERNAL_LOGGER_NAME),
            "email.smtp.send_failed",
            "SMTP email send failed.",
            error=exc,
            provider="smtp",
            request_id=request_id,
            kind=payload.kind,
            from_domain=_email_domain(_smtp_from_email() or ""),
            recipient_domains=[_email_domain(recipient) for recipient in payload.to],
        )
        return EmailEvent(
            request_id=request_id,
            kind=payload.kind,
            provider="smtp",
            status="failed",
            to=payload.to,
            subject=subject,
            safe_message=_smtp_failure_message(resend_error),
            body_text=body_text,
            attachment_names=attachment_names,
            review_round=payload.review_round,
        )


def _send_smtp_message(
    payload: NotificationRequest,
    subject: str,
    body_text: str,
    body_html: str,
    attachments: list[tuple[str, bytes, str]],
) -> None:
    from_email = _smtp_from_email()
    host = os.environ["SMTP_HOST"]
    port = _smtp_port()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_email
    message["To"] = ", ".join(payload.to)
    if payload.cc:
        message["Cc"] = ", ".join(payload.cc)
    message.set_content(body_text)
    message.add_alternative(body_html, subtype="html")
    for filename, content, content_type in attachments:
        maintype, _, subtype = content_type.partition("/")
        message.add_attachment(content, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=filename)

    recipients = [*payload.to, *payload.cc]
    if _smtp_use_ssl():
        with smtplib.SMTP_SSL(host, port, timeout=30.0, context=ssl.create_default_context()) as smtp:
            _smtp_login(smtp)
            smtp.send_message(message, from_addr=from_email, to_addrs=recipients)
        return

    with smtplib.SMTP(host, port, timeout=30.0) as smtp:
        if _smtp_use_starttls():
            smtp.starttls(context=ssl.create_default_context())
        _smtp_login(smtp)
        smtp.send_message(message, from_addr=from_email, to_addrs=recipients)


def _smtp_login(smtp: smtplib.SMTP) -> None:
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    if username and password:
        smtp.login(username, password)


def _smtp_from_email() -> str | None:
    return os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USERNAME")


def _smtp_port() -> int:
    raw_port = os.getenv("SMTP_PORT")
    if not raw_port:
        return 465 if _smtp_use_ssl() else SMTP_DEFAULT_PORT
    return int(raw_port)


def _smtp_use_ssl() -> bool:
    return os.getenv("SMTP_USE_SSL", "").lower() in {"1", "true", "yes"}


def _smtp_use_starttls() -> bool:
    return os.getenv("SMTP_USE_STARTTLS", "true").lower() not in {"0", "false", "no"} and not _smtp_use_ssl()


def _subject(payload: NotificationRequest, request: CorporateTravelRequest) -> str:
    traveler = request.traveller_details.traveler_name or "traveler"
    if payload.kind in {"approval_request", "review_link"}:
        return f"Approval needed for {traveler}'s travel plan"
    if payload.kind == "document_update":
        return f"Document update needed for {traveler}"
    if payload.kind == "client_cancelled":
        return f"Travel request cancelled for {traveler}"
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
    return "\n".join(lines)


def _safe_email_body(value: str) -> str:
    return mask_sensitive_customer_text(value).strip()[:6000]


def _idempotency_key(request_id: str, payload: NotificationRequest) -> str:
    if payload.review_round is None:
        return f"travel-ai/{request_id}/{payload.kind}"
    return f"travel-ai/{request_id}/{payload.kind}/round-{payload.review_round}"


def _send_failure_message(exc: Exception, from_email: str) -> str:
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 403 and _email_domain(from_email) == "resend.dev":
        return "Email provider rejected this recipient because the Resend test sender can only deliver to the Resend account email. Verify a sending domain to email client addresses."
    return "Email notification could not be sent. Continue with manual follow-up."


def _smtp_failure_message(resend_error: Exception | None) -> str:
    if resend_error:
        return "Resend could not deliver the email and SMTP fallback also failed. Continue with manual follow-up."
    return "SMTP email could not be sent. Continue with manual follow-up."


def _email_domain(value: str) -> str:
    address = value.split("<")[-1].split(">")[0].strip()
    if "@" not in address:
        return ""
    return address.rsplit("@", 1)[1].lower()


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
    selected_option = _selected_travel_option(request)
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
            ("Cab service source", "Ground transport"),
            ("Cab service", cab_service),
            ("Cab pickup", f"{selected_transfer.pickup_airport_code} at {selected_transfer.pickup_time or 'time pending'}"),
            ("Cab dropoff", f"{selected_transfer.dropoff_label} ({selected_transfer.dropoff_address or 'address pending'})"),
        ])
    estimated_cost = selected_option.estimated_cost if selected_option else plan.budget_policy_check.estimated_cost
    final_currency = origin_city_currency(request.travel_details.origin, request.budgets.currency)
    final_total = int(round(convert_final_amount(estimated_cost, request.budgets.currency or "USD", final_currency).amount))
    rows.append(("Final total", f"{final_total} {final_currency}"))
    return rows


def _selected_travel_option(request: CorporateTravelRequest):
    plan = request.generated_plan
    if not plan or not plan.travel_options:
        return None
    index = (request.client_review.selected_option_index - 1) if request.client_review and request.client_review.selected_option_index else 0
    if index < 0 or index >= len(plan.travel_options):
        return plan.travel_options[0]
    return plan.travel_options[index]
