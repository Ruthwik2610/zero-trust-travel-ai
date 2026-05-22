export type Cabin = "economy" | "premium_economy" | "business" | "first";
export type Risk = "low" | "medium" | "high";
export type TripStatus = "draft" | "submitted" | "booked" | "cancelled";
export type OfferKind = "flight" | "hotel";
export type UserRole = "traveler" | "travel_manager" | "finance_admin" | "security_admin";
export type SupportedCurrency = "USD" | "INR" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "ZAR";

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
  flight_legs?: FlightLeg[];
};

export type FlightLeg = {
  direction: "outbound" | "return";
  origin: string;
  destination: string;
  departure_at?: string | null;
  arrival_at?: string | null;
  stops?: number | null;
  airline?: string | null;
};

export type ItineraryItem = {
  day: number;
  title: string;
  details: string;
};

export type Trip = {
  id: string;
  owner_id?: string;
  owner_department?: string;
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
  actor_id?: string | null;
  event_type: string;
  message: string;
  purpose?: string | null;
  decision?: "allow" | "deny" | "record";
  created_at: string;
};

export type AdminSummary = {
  total_trips: number;
  draft_trips: number;
  booked_trips: number;
  high_risk_trips: number;
  audit_events: number;
  budget_utilization_usd?: number;
  visa_expiring_soon?: number;
  policy_updates_due?: number;
  budget_by_traveler?: Array<{
    traveler_ref: string;
    department: string;
    trip_count: number;
    spend_usd: number;
    policy_flags: number;
    visa_status: "ok" | "expiring_soon" | "unknown";
  }>;
};

export type PlanResponse = {
  trip: Trip;
  risk: Risk;
  user_message: string;
  audit_events: AuditEvent[];
};

export type TravelChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TravelChatRequest = {
  message: string;
  history?: TravelChatMessage[];
  trip?: Trip | null;
};

export type TravelChatResponse = {
  message: string;
  model: string;
  audit_events: AuditEvent[];
};

export type AuthContext = {
  user_id: string;
  email: string;
  role: UserRole;
  department: string;
  scopes: string[];
  manager_scope: string[];
  token_expires_at: number;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: number;
  user: AuthContext;
};

export type CurrencyConversionRequest = {
  amount_usd: number;
  to_currency: SupportedCurrency;
};

export type CurrencyConversionResponse = {
  amount: number;
  currency: SupportedCurrency;
  rate: number;
  display: string;
  source: "mcp" | "planning_rate";
};

export type CorporateRole = "admin" | "agent";
export type CorporateRequestStatus = "new" | "planning" | "pending_approval" | "missing_info" | "finalized";
export type CorporateCheckStatus = "clear" | "attention" | "blocked" | "pending";
export type CorporateApprovalStatus = "Not Required" | "Required" | "Received" | "Rejected";

export type CorporatePlanOption = {
  id: string;
  name: string;
  flightSummary: string;
  hotelSummary: string;
  totalAmount: number;
  currency: string;
  policyFit: string;
  tradeoffs: string;
  selected?: boolean;
};

export type CorporateTravelRequest = {
  id: string;
  travellerName: string;
  travellerEmail: string;
  company: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  purpose: string;
  preferences: string;
  budgetAmount: number;
  budgetCurrency: string;
  specialRequests: string;
  status: CorporateRequestStatus;
  visaStatus: CorporateCheckStatus;
  budgetStatus: CorporateCheckStatus;
  approvalStatus: CorporateApprovalStatus;
  lastUpdated: string;
  originalRequest: string;
  aiSummary: string;
  readinessCheck: string;
  budgetPolicyCheck: string;
  recommendedPlans: CorporatePlanOption[];
  missingInformation: string;
  customerMessageDraft: string;
  finalItineraryDraft: string;
  finalApproved: boolean;
};

export type CorporateCreateRequest = {
  travellerName: string;
  travellerEmail: string;
  company: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  purpose: string;
  preferences: string;
  budgetAmount: number;
  budgetCurrency: string;
  specialRequests: string;
};

export type CorporateRequestUpdate = Partial<Pick<
  CorporateTravelRequest,
  "aiSummary" | "readinessCheck" | "budgetPolicyCheck" | "missingInformation" | "customerMessageDraft" | "finalItineraryDraft" | "recommendedPlans" | "status" | "budgetStatus" | "approvalStatus" | "finalApproved"
>> & {
  agent_reviewed?: boolean;
  approval_status?: CorporateApprovalStatus;
};

export type CorporateUploadResponse = {
  totalRows: number;
  createdRequests: number;
  skippedRows: number;
  requests: CorporateTravelRequest[];
};

export type CorporateAdminSummary = {
  totalRequests: number;
  newRequests: number;
  pendingApprovals: number;
  missingInfo: number;
  visaIssues: number;
  finalizedItineraries: number;
  averageHandlingTimeHours: number;
  commonDestinations: Array<{ destination: string; count: number }>;
};

export type TravelerProfile = {
  id: string;
  name: string;
  email: string;
  company: string;
  department?: string | null;
  vip_level?: string | null;
  status: "Compliant" | "Passport Expiring" | "Missing Passport" | "Document Update Required";
  location?: string | null;
  seat_preference?: string | null;
  meal_preference?: string | null;
  hotel_preference?: string | null;
  policy_notes: string[];
  loyalty_programs: Array<{ provider: string; tier?: string | null; account_ref?: string | null }>;
  documents: Array<{
    document_type: "passport" | "visa" | "known_traveler" | "other";
    label: string;
    status: "Ready" | "Expiring Soon" | "Missing" | "Needs Review";
    expires_at?: string | null;
    redacted_value?: string | null;
  }>;
  recent_trips: string[];
  created_at: string;
  updated_at: string;
};

export type PolicyRule = {
  label: string;
  value: string;
  status: "Active" | "Draft" | "Changed" | "Removed";
};

export type PolicyRevision = {
  id: string;
  version: string;
  status: "Draft" | "Proposed" | "In Review" | "Approved" | "Changes Requested" | "Archived";
  summary: string;
  proposed_rules: PolicyRule[];
  impact_analysis?: string | null;
  reviewer_comments: string[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type PolicyGroup = {
  id: string;
  client_name: string;
  business_unit?: string | null;
  status: "Active" | "Draft" | "Archived";
  active_rules: PolicyRule[];
  revisions: PolicyRevision[];
  compliance_score: number;
  updated_at: string;
};

export type PolicyActivityEvent = {
  id: string;
  policy_id?: string | null;
  actor: string;
  activity: string;
  status: "SUCCESS" | "PENDING AUDIT" | "REVIEW" | "FAILED";
  created_at: string;
};

export type EmailEvent = {
  id: string;
  request_id?: string | null;
  kind?: "approval_request" | "document_update" | "final_itinerary" | null;
  provider: "resend";
  status: "sent" | "configuration_required" | "failed" | "received";
  to: string[];
  subject?: string | null;
  provider_message_id?: string | null;
  safe_message: string;
  created_at: string;
};
