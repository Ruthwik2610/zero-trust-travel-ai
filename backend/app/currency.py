import json
import os
from datetime import date
from pathlib import Path
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

    backup_rate = _daily_backup_rate(to_currency)
    if backup_rate:
        return _response(amount_usd, to_currency, backup_rate, "daily_backup_rate")

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


def _daily_backup_rate(to_currency: SupportedCurrency) -> float | None:
    cache = _read_rate_cache()
    today = date.today().isoformat()
    if cache.get("date") == today:
        rate = _number((cache.get("rates") or {}).get(to_currency)) if isinstance(cache.get("rates"), dict) else None
        if rate:
            return rate

    try:
        response = httpx.get(
            os.getenv("TRAVEL_AI_BACKUP_RATES_URL", "https://api.frankfurter.app/latest"),
            params={"from": "USD"},
            timeout=8,
        )
        response.raise_for_status()
        payload = response.json()
        rates = payload.get("rates") if isinstance(payload, dict) else None
        if not isinstance(rates, dict):
            return None
        clean_rates = {
            currency: float(rate)
            for currency, rate in rates.items()
            if currency in PLANNING_RATES and _number(rate) is not None
        }
        if clean_rates:
            _write_rate_cache({"date": today, "rates": clean_rates})
        return clean_rates.get(to_currency)
    except Exception:
        return None


def _rate_cache_path() -> Path:
    return Path(os.getenv("TRAVEL_AI_CURRENCY_CACHE_PATH", "data/currency_rates.json"))


def _read_rate_cache() -> dict[str, Any]:
    path = _rate_cache_path()
    try:
        if path.exists():
            payload = json.loads(path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}
    return {}


def _write_rate_cache(payload: dict[str, Any]) -> None:
    path = _rate_cache_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
    except Exception:
        return None


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
