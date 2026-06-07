from .models import TravelBudget, TravelDetails


LONG_HAUL_FLIGHT_HOURS_ONE_WAY = 15
SHORT_HAUL_FLIGHT_HOURS_ONE_WAY = 5
LONG_HAUL_ROUTE_MARKERS = (
    "johannesburg",
    "south africa",
    "tokyo",
    "london",
    "san francisco",
    "new york",
    "berlin",
)


def trip_budget_days(travel: TravelDetails) -> int:
    if travel.depart_date and travel.return_date:
        return max(1, (travel.return_date - travel.depart_date).days)
    return 1


def estimated_flight_hours(budget: TravelBudget, travel: TravelDetails) -> int:
    if budget.estimated_flight_hours:
        return budget.estimated_flight_hours
    if not (travel.include_outbound_flight or travel.include_return_flight):
        return 0
    route_text = " ".join([
        travel.origin or "",
        travel.destination or "",
        travel.destination_country or "",
    ]).lower()
    one_way_hours = LONG_HAUL_FLIGHT_HOURS_ONE_WAY if any(marker in route_text for marker in LONG_HAUL_ROUTE_MARKERS) else SHORT_HAUL_FLIGHT_HOURS_ONE_WAY
    legs = int(bool(travel.include_outbound_flight)) + int(bool(travel.include_return_flight))
    return one_way_hours * max(legs, 1)


def component_budget_limit(budget: TravelBudget, travel: TravelDetails) -> int | None:
    daily_budget = budget.daily_budget or 0
    flight_hourly_budget = budget.flight_budget_per_hour or 0
    if not (daily_budget or flight_hourly_budget):
        return None
    daily_total = daily_budget * trip_budget_days(travel)
    flight_total = flight_hourly_budget * estimated_flight_hours(budget, travel)
    total = daily_total + flight_total
    return total if total > 0 else None


def effective_budget_limit(budget: TravelBudget, travel: TravelDetails) -> int | None:
    return component_budget_limit(budget, travel) or budget.total_budget


def budget_with_effective_total(budget: TravelBudget, travel: TravelDetails) -> TravelBudget:
    limit = effective_budget_limit(budget, travel)
    if not limit or budget.total_budget == limit:
        return budget
    return budget.model_copy(update={"total_budget": limit})


def budget_basis_text(budget: TravelBudget, travel: TravelDetails) -> str | None:
    limit = component_budget_limit(budget, travel)
    if not limit:
        return None
    currency = budget.currency or "USD"
    parts = []
    if budget.daily_budget:
        days = trip_budget_days(travel)
        parts.append(f"daily budget {budget.daily_budget} {currency} x {days} day(s)")
    if budget.flight_budget_per_hour:
        hours = estimated_flight_hours(budget, travel)
        parts.append(f"flight budget {budget.flight_budget_per_hour} {currency}/hour x {hours} flight hour(s)")
    return f"Budget basis: {' + '.join(parts)} = {limit} {currency}."
