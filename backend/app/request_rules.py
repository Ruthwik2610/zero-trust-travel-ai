from .models import CorporateTravelRequest


def request_with_component_dependencies(request: CorporateTravelRequest) -> CorporateTravelRequest:
    if request.travel_details.include_hotel:
        return request

    travel_updates: dict[str, object] = {}
    preference_updates: dict[str, object] = {}
    if request.travel_details.include_ground_transfer:
        travel_updates["include_ground_transfer"] = False
    if request.preferences.airport_transfer_needed:
        preference_updates["airport_transfer_needed"] = False
    if not (travel_updates or preference_updates):
        return request

    updated = request
    if travel_updates:
        updated = updated.model_copy(update={"travel_details": updated.travel_details.model_copy(update=travel_updates)})
    if preference_updates:
        updated = updated.model_copy(update={"preferences": updated.preferences.model_copy(update=preference_updates)})
    return updated
