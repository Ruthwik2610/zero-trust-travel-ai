export type Cabin = "economy" | "premium_economy" | "business" | "first";
export type Risk = "low" | "medium" | "high";
export type TripStatus = "draft" | "submitted" | "booked" | "cancelled";
export type OfferKind = "flight" | "hotel";

export type TravelRequest = {
  origin: string;
  destination: string;
  depart_date: string;
  return_date?: string | null;
  travelers: number;
  cabin: Cabin;
  budget_usd?: number | null;
  purpose?: string | null;
};

export type Offer = {
  id: string;
  kind: OfferKind;
  title: string;
  provider: string;
  price_usd: number;
  currency: string;
  refundable: boolean;
  notes: string[];
};

export type ItineraryItem = {
  day: number;
  title: string;
  details: string;
};

export type Trip = {
  id: string;
  request: TravelRequest;
  status: TripStatus;
  risk: Risk;
  flight_offers: Offer[];
  hotel_offers: Offer[];
  itinerary: ItineraryItem[];
  policy_checks: string[];
  savings_suggestions: string[];
  created_at: string;
};

export type AuditEvent = {
  id: string;
  trip_id?: string | null;
  event_type: string;
  message: string;
  created_at: string;
};

export type AdminSummary = {
  total_trips: number;
  draft_trips: number;
  booked_trips: number;
  high_risk_trips: number;
  audit_events: number;
};

export type PlanResponse = {
  trip: Trip;
  risk: Risk;
  user_message: string;
  audit_events: AuditEvent[];
};
