import json
import os
from typing import Any

import httpx

from .models import CurrencyConversionResponse, SupportedCurrency


PLANNING_RATES: dict[SupportedCurrency, float] = {
    "USD": 1.0,
    "INR": 83.2,
    "EUR": 0.92,
    "GBP": 0.79,
    "CAD": 1.36,
    "AUD": 1.51,
    "JPY": 155.0,
    "ZAR": 18.2,
}


def convert_from_usd(amount_usd: int, to_currency: SupportedCurrency) -> CurrencyConversionResponse:
    if to_currency == "USD":
        return _response(amount_usd, to_currency, 1.0, "planning_rate")

    mcp_result = _mcp_conversion(amount_usd, to_currency)
    if mcp_result:
        return mcp_result

    return _response(amount_usd, to_currency, PLANNING_RATES[to_currency], "planning_rate")


def _mcp_conversion(amount_usd: int, to_currency: SupportedCurrency) -> CurrencyConversionResponse | None:
    base_url = os.getenv("TRAVEL_AI_MCP_TOOLS_URL", "http://127.0.0.1:8083/tools").rstrip("/")
    try:
        response = httpx.post(
            f"{base_url}/convert_currency",
            json={"amount": amount_usd, "from_currency": "USD", "to_currency": to_currency},
            timeout=8,
        )
        response.raise_for_status()
        payload = _extract_payload(response.json())
        converted = _number(payload.get("converted_amount") or payload.get("amount") or payload.get("value"))
        rate = _number(payload.get("rate") or payload.get("exchange_rate"))
        if converted is None:
            return None
        if rate is None:
            rate = converted / amount_usd if amount_usd else PLANNING_RATES[to_currency]
        return CurrencyConversionResponse(
            amount=round(converted, 2),
            currency=to_currency,
            rate=round(rate, 6),
            display=_format_money(converted, to_currency),
            source="mcp",
        )
    except Exception:
        return None


def _extract_payload(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict) and "content" in raw:
        for item in raw.get("content") or []:
            if isinstance(item, dict) and item.get("type") == "text":
                text = str(item.get("text") or "").strip()
                parsed = json.loads(text)
                return parsed[0] if isinstance(parsed, list) and parsed else parsed
    return raw if isinstance(raw, dict) else {}


def _response(amount_usd: int, currency: SupportedCurrency, rate: float, source: str) -> CurrencyConversionResponse:
    converted = amount_usd * rate
    return CurrencyConversionResponse(
        amount=round(converted, 2),
        currency=currency,
        rate=round(rate, 6),
        display=_format_money(converted, currency),
        source=source,  # type: ignore[arg-type]
    )


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_money(value: float, currency: SupportedCurrency) -> str:
    symbols = {"USD": "$", "INR": "₹", "EUR": "€", "GBP": "£", "CAD": "C$", "AUD": "A$", "JPY": "¥", "ZAR": "R"}
    digits = 0 if currency in {"JPY", "INR"} else 2
    return f"{symbols[currency]}{value:,.{digits}f}"
