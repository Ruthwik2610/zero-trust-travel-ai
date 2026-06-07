import type {
  AdminSummary,
  AuditEvent,
  AuthContext,
  AuthTokenResponse,
  ClientReviewResponse,
  CompanyPipelineStatus,
  CompanyPolicyImportResponse,
  CorporateAdminSummary,
  CorporateClientReviewEvent,
  CorporateCreateRequest,
  CorporateGroundTransferOffer,
  CorporateRequestUpdate,
  CorporateTravelRequest,
  CorporateUploadResponse,
  CurrencyConversionRequest,
  CurrencyConversionResponse,
  EmailEvent,
  PolicyActivityEvent,
  PolicyGroup,
  PolicyRevision,
  PlanResponse,
  TravelerProfile,
  TravelChatRequest,
  TravelChatResponse,
  TravelRequest,
  Trip
} from "./types";

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_TRAVEL_AI_API_BASE_URL ?? "";
const TOKEN_KEY = "travel_ai_api_token";
const AUTH_CONTEXT_KEY = "travel_ai_auth_context";

function apiBase() {
  if (CONFIGURED_API_BASE) return CONFIGURED_API_BASE.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/travel-ai")) {
    return "/travel-ai";
  }
  return "";
}

function authHeaders(purpose?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (purpose) headers["X-Travel-Purpose"] = purpose;
  if (typeof window === "undefined") return headers;
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

async function refreshDemoSession() {
  if (typeof window === "undefined") return false;
  clearAuthSession();
  return false;
}

async function request<T>(path: string, init?: RequestInit & { purpose?: string; retryAuth?: boolean }): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(init?.purpose),
      ...init?.headers
    }
  });

  if (!response.ok) {
    if (
      (response.status === 401 || response.status === 403)
      && init?.retryAuth !== false
      && path !== "/api/auth/demo-login"
      && await refreshDemoSession()
    ) {
      return request<T>(path, { ...init, retryAuth: false });
    }
    throw new Error(await safeResponseErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function safeResponseErrorMessage(response: Response) {
  if (![400, 401, 403, 404, 409].includes(response.status)) return "Travel service request failed";
  try {
    const body = await response.clone().json() as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.length <= 600 && !/(token|secret|password|api[_ -]?key)/i.test(body.detail)) {
      return body.detail;
    }
  } catch {
    return "Travel service request failed";
  }
  return "Travel service request failed";
}

async function requestVoid(path: string, init?: RequestInit & { purpose?: string; retryAuth?: boolean }): Promise<void> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...authHeaders(init?.purpose),
      ...init?.headers
    }
  });

  if (!response.ok) {
    if (
      (response.status === 401 || response.status === 403)
      && init?.retryAuth !== false
      && await refreshDemoSession()
    ) {
      return requestVoid(path, { ...init, retryAuth: false });
    }
    throw new Error("Travel service request failed");
  }
}

async function requestBlob(path: string, init?: RequestInit & { purpose?: string; retryAuth?: boolean }): Promise<Blob> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...authHeaders(init?.purpose),
      ...init?.headers
    }
  });

  if (!response.ok) {
    if (
      (response.status === 401 || response.status === 403)
      && init?.retryAuth !== false
      && await refreshDemoSession()
    ) {
      return requestBlob(path, { ...init, retryAuth: false });
    }
    throw new Error("Travel service request failed");
  }

  return response.blob();
}

export function getStoredAuthContext(): AuthContext | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const raw = window.localStorage.getItem(AUTH_CONTEXT_KEY);
  if (!raw || !token) {
    clearAuthSession();
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AuthContext;
    if (!parsed.token_expires_at || parsed.token_expires_at <= Math.floor(Date.now() / 1000)) {
      clearAuthSession();
      return null;
    }
    return parsed;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function storeAuthSession(session: AuthTokenResponse) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, session.access_token);
  window.localStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(session.user));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(AUTH_CONTEXT_KEY);
  window.localStorage.removeItem("travel_ai_user_email");
}

export function checkHealth() {
  return request<{ status: string }>("/health");
}

export function demoLogin(email: string, password?: string, username?: string) {
  return request<AuthTokenResponse>("/api/auth/demo-login", {
    method: "POST",
    retryAuth: false,
    body: JSON.stringify({
      email,
      ...(username ? { username } : {}),
      ...(password ? { password } : {})
    })
  });
}

export function planTrip(payload: TravelRequest, signal?: AbortSignal) {
  return request<PlanResponse>("/api/agent/plan", {
    method: "POST",
    signal,
    purpose: "plan compliant business travel",
    body: JSON.stringify(payload)
  });
}

export function chatWithAssistant(payload: TravelChatRequest, signal?: AbortSignal) {
  return request<TravelChatResponse>("/api/agent/chat", {
    method: "POST",
    signal,
    purpose: "chat with travel assistant for compliant business travel",
    body: JSON.stringify(payload)
  });
}

export function convertCurrency(payload: CurrencyConversionRequest, signal?: AbortSignal) {
  return request<CurrencyConversionResponse>("/api/tools/currency-conversion", {
    method: "POST",
    signal,
    purpose: "plan compliant business travel",
    body: JSON.stringify(payload)
  });
}

export function getTrips() {
  return request<Trip[]>("/api/trips", {
    purpose: "review own saved trips"
  });
}

export function saveTrip(payload: TravelRequest) {
  return request<Trip>("/api/trips", {
    method: "POST",
    purpose: "save compliant travel draft",
    body: JSON.stringify(payload)
  });
}

export function getAdminSummary() {
  return request<AdminSummary>("/api/admin/summary", {
    purpose: "review aggregate travel policy posture"
  });
}

export function getAuditEvents() {
  return request<AuditEvent[]>("/api/admin/audit", {
    purpose: "review security audit events"
  });
}

export function getEmailEvents() {
  return request<EmailEvent[]>("/api/corporate/admin/email-events", {
    purpose: "review corporate travel email audit events"
  });
}

export function listCorporateRequests() {
  return request<unknown[]>("/api/corporate/requests", {
    purpose: "review corporate travel request queue"
  }).then((items) => items.map(mapCorporateRequest));
}

export function createCorporateRequest(payload: CorporateCreateRequest) {
  return request<unknown>("/api/corporate/requests", {
    method: "POST",
    purpose: "create corporate travel request",
    body: JSON.stringify(toBackendCorporateRequest(payload))
  }).then(mapCorporateRequest);
}

export function getCorporateRequest(id: string) {
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}`, {
    purpose: "review corporate travel request detail"
  }).then(mapCorporateRequest);
}

export function generateCorporateTravelPlan(id: string) {
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}/plan`, {
    method: "POST",
    purpose: "generate corporate travel plan"
  }).then(mapCorporateRequest);
}

export function runCorporateRequestPipeline(id: string) {
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}/pipeline`, {
    method: "POST",
    purpose: "run automated corporate travel pipeline"
  }).then(mapCorporateRequest);
}

export function recordClientItineraryApproval(id: string, payload: { selected_option_name?: string; selected_option_index?: number }) {
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}/client-approval`, {
    method: "POST",
    purpose: "record client itinerary approval",
    body: JSON.stringify(payload)
  }).then(mapCorporateRequest);
}

export function getClientReview(token: string) {
  return request<unknown>(`/api/corporate/reviews/${encodeURIComponent(token)}`, {
    purpose: "review signed client itinerary options",
    retryAuth: false
  }).then(mapClientReviewResponse);
}

export function submitClientReview(token: string, payload: { action: "approve" | "request_edits" | "cancel"; selected_option_index?: number; edit_request_text?: string }) {
  return request<unknown>(`/api/corporate/reviews/${encodeURIComponent(token)}`, {
    method: "POST",
    purpose: "submit signed client itinerary review",
    retryAuth: false,
    body: JSON.stringify(payload)
  }).then(mapClientReviewResponse);
}

export function updateCorporateRequest(id: string, payload: CorporateRequestUpdate) {
  const body: Record<string, unknown> = {
    generated_plan: toBackendCorporatePlan(payload)
  };
  if (payload.travellerName !== undefined || payload.travellerEmail !== undefined || payload.travellerNationality !== undefined) {
    body.traveller_details = {
      ...(payload.travellerName !== undefined ? { traveler_name: payload.travellerName || null } : {}),
      ...(payload.travellerEmail !== undefined ? { traveler_email: payload.travellerEmail || null } : {}),
      ...(payload.travellerNationality !== undefined ? { nationality: payload.travellerNationality || null } : {})
    };
  }
  if (payload.company !== undefined) {
    body.company_details = {
      company_name: payload.company || null
    };
  }
  if (
    payload.origin !== undefined ||
    payload.destination !== undefined ||
    payload.departDate !== undefined ||
    payload.returnDate !== undefined ||
    payload.includeOutboundFlight !== undefined ||
    payload.includeReturnFlight !== undefined ||
    payload.includeHotel !== undefined ||
    payload.purpose !== undefined
  ) {
    body.travel_details = {
      ...(payload.origin !== undefined ? { origin: payload.origin || null } : {}),
      ...(payload.destination !== undefined ? { destination: payload.destination || null } : {}),
      ...(payload.departDate !== undefined ? { depart_date: payload.departDate || null } : {}),
      ...(payload.returnDate !== undefined ? { return_date: payload.returnDate || null } : {}),
      ...(payload.includeOutboundFlight !== undefined ? { include_outbound_flight: payload.includeOutboundFlight } : {}),
      ...(payload.includeReturnFlight !== undefined ? { include_return_flight: payload.includeReturnFlight } : {}),
      ...(payload.includeHotel !== undefined ? { include_hotel: payload.includeHotel } : {}),
      ...(payload.purpose !== undefined ? { trip_purpose: payload.purpose || null } : {})
    };
  }
  if (payload.preferences !== undefined) {
    body.preferences = {
      flight_preference: payload.preferences || null,
      hotel_preference: payload.preferences || null,
      meal_preference: payload.preferences || null,
      timing_preference: payload.preferences || null
    };
  }
  if (payload.specialRequests !== undefined) {
    body.special_requests = splitLines(payload.specialRequests);
  }
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}/plan`, {
    method: "PUT",
    purpose: "update corporate travel request draft",
    body: JSON.stringify(body)
  }).then(mapCorporateRequest);
}

export function finalizeCorporateRequest(id: string, payload: CorporateRequestUpdate) {
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    purpose: "finalize reviewed corporate itinerary",
    body: JSON.stringify({
      agent_reviewed: payload.agent_reviewed ?? payload.finalApproved ?? true,
      approval_status: payload.approval_status || payload.approvalStatus || "Received"
    })
  }).then(mapCorporateRequest);
}

export function uploadCorporateRequests(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<unknown>("/api/corporate/requests/upload-excel", {
    method: "POST",
    purpose: "upload corporate travel requests from form",
    body: formData
  }).then(mapCorporateUploadResponse);
}

export function updateCorporateCriticalIssue(id: string, issue: string | null, status: CorporateTravelRequest["criticalIssueStatus"] = "Urgent") {
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}/critical-issue`, {
    method: "POST",
    purpose: "update urgent corporate travel issue",
    body: JSON.stringify({ issue, status })
  }).then(mapCorporateRequest);
}

export function deleteCorporateRequest(id: string) {
  return requestVoid(`/api/corporate/requests/${encodeURIComponent(id)}`, {
    method: "DELETE",
    purpose: "delete corporate travel request"
  });
}

export function listCompanyPipelineStatuses() {
  return request<unknown[]>("/api/corporate/companies", {
    purpose: "review company traveler and policy pipeline"
  }).then((items) => items.map(mapCompanyPipelineStatus));
}

export function uploadCompanyPolicyPdf(file: File, companyName?: string) {
  const formData = new FormData();
  formData.append("file", file);
  return request<unknown>("/api/corporate/company-policy/upload-pdf", {
    method: "POST",
    purpose: "upload company policy pdf",
    headers: companyName ? { "X-Company-Name": companyName } : undefined,
    body: formData
  }).then(mapCompanyPolicyImportResponse);
}

export function downloadCorporateExcelTemplate() {
  return requestBlob("/api/corporate/excel-template", {
    purpose: "download corporate travel excel template"
  });
}

export function downloadClientRequestFormPdf() {
  return requestBlob("/api/corporate/request-form.pdf", {
    purpose: "download client travel request form"
  });
}

export function downloadClientRequestFormDocx() {
  return requestBlob("/api/corporate/request-form.docx", {
    purpose: "download client travel request form"
  });
}

export function downloadCorporateRequestExcel(id: string) {
  return requestBlob(`/api/corporate/requests/${encodeURIComponent(id)}/export.xlsx`, {
    purpose: "download finalized corporate travel itinerary excel"
  });
}

export function downloadCorporateRequestPdf(id: string) {
  return requestBlob(`/api/corporate/requests/${encodeURIComponent(id)}/export.pdf`, {
    purpose: "download finalized corporate travel itinerary pdf"
  });
}

export function getCorporateAdminSummary() {
  return request<unknown>("/api/corporate/admin/summary", {
    purpose: "review corporate travel operations summary"
  }).then(mapCorporateAdminSummary);
}

export function listTravelers() {
  return request<TravelerProfile[]>("/api/travelers", {
    purpose: "review traveler roster"
  });
}

export function getTraveler(id: string) {
  return request<TravelerProfile>(`/api/travelers/${encodeURIComponent(id)}`, {
    purpose: "review traveler dossier"
  });
}

export function saveTravelerProfile(profile: TravelerProfile) {
  return request<TravelerProfile>(`/api/travelers/${encodeURIComponent(profile.id)}`, {
    method: "PUT",
    purpose: "save traveler roster profile",
    body: JSON.stringify(profile)
  });
}

export function listPolicies() {
  return request<PolicyGroup[]>("/api/policies", {
    purpose: "review policy center"
  });
}

export function getPolicy(id: string) {
  return request<PolicyGroup>(`/api/policies/${encodeURIComponent(id)}`, {
    purpose: "review policy detail"
  });
}

export function listPolicyVersions(id: string) {
  return request<PolicyRevision[]>(`/api/policies/${encodeURIComponent(id)}/versions`, {
    purpose: "review policy lifecycle"
  });
}

export function listPolicyActivity(id?: string) {
  const path = id ? `/api/policies/${encodeURIComponent(id)}/activity` : "/api/policies/policy_global_travel_2024/activity";
  return request<PolicyActivityEvent[]>(path, {
    purpose: "review policy activity"
  });
}

export function approvePolicyRevision(policyId: string, revisionId: string, comment?: string) {
  return request<PolicyGroup>(`/api/policies/${encodeURIComponent(policyId)}/revisions/${encodeURIComponent(revisionId)}/approve`, {
    method: "POST",
    purpose: "approve policy revision",
    body: JSON.stringify({ comment: comment || "" })
  });
}

export function requestPolicyRevisionChanges(policyId: string, revisionId: string, comment: string) {
  return request<PolicyGroup>(`/api/policies/${encodeURIComponent(policyId)}/revisions/${encodeURIComponent(revisionId)}/request-changes`, {
    method: "POST",
    purpose: "request policy revision changes",
    body: JSON.stringify({ comment })
  });
}

export function sendCorporateRequestNotification(id: string, payload: {
  kind: "approval_request" | "review_link" | "document_update" | "final_itinerary" | "client_cancelled";
  to: string[];
  cc?: string[];
  note?: string;
  review_url?: string;
  change_summary?: string;
  review_round?: number;
  attach_itinerary?: boolean;
}) {
  return request<EmailEvent>(`/api/corporate/requests/${encodeURIComponent(id)}/notifications`, {
    method: "POST",
    purpose: "send corporate travel notification",
    body: JSON.stringify(payload)
  });
}

function toBackendCorporateRequest(payload: CorporateCreateRequest) {
  return {
    traveller_details: {
      traveler_name: payload.travellerName,
      ...(payload.travellerEmail ? { traveler_email: payload.travellerEmail } : {}),
      employee_band: payload.employeeBand || null,
      employee_level: payload.employeeBand || null
    },
    travel_details: {
      origin: payload.origin,
      destination: payload.destination,
      depart_date: payload.departDate || null,
      return_date: payload.returnDate || null,
      include_outbound_flight: payload.includeOutboundFlight,
      include_return_flight: payload.includeReturnFlight,
      include_hotel: payload.includeHotel,
      travelers: 1
    },
    preferences: {
      hotel_preference: payload.preferences
    },
    special_requests: splitLines(payload.specialRequests),
    status: "New Entries"
  };
}

function mapCorporateRequest(raw: unknown): CorporateTravelRequest {
  const item = raw as Record<string, any>;
  if ("travellerName" in item) return item as CorporateTravelRequest;

  const traveller = item.traveller_details || {};
  const company = item.company_details || {};
  const travel = item.travel_details || {};
  const preferences = item.preferences || {};
  const budgets = item.budgets || {};
  const plan = item.generated_plan || null;
  const budgetPolicy = plan?.budget_policy_check || {};
  const readiness = plan?.travel_readiness || {};
  const flightOffers = Array.isArray(plan?.flight_offers)
    ? plan.flight_offers.map(mapCorporateFlightOffer)
    : [];
  const selectedFlightOfferId = String(plan?.selected_flight_offer_id || flightOffers[0]?.id || "");
  const hotelOffers = Array.isArray(plan?.hotel_offers)
    ? plan.hotel_offers.map(mapCorporateHotelOffer)
    : [];
  const selectedHotelOfferId = String(plan?.selected_hotel_offer_id || hotelOffers[0]?.id || "");
  const groundTransferOffers = Array.isArray(plan?.ground_transfer_offers)
    ? plan.ground_transfer_offers.map(mapCorporateGroundTransferOffer)
    : [];
  const selectedGroundTransferOfferId = String(plan?.selected_ground_transfer_offer_id || groundTransferOffers[0]?.id || "");
  const currency = String(budgets.currency || "INR");
  const destination = String(travel.destination || travel.destination_country || "Destination pending");
  const status = frontendStatusFromBackend(item.status);
  const missing = Array.isArray(plan?.missing_information) ? plan.missing_information : [];
  const agentNotes = Array.isArray(plan?.agent_notes) ? plan.agent_notes.map(String).filter(Boolean) : [];

  return {
    id: String(item.id || ""),
    travellerName: String(traveller.traveler_name || "Traveller pending"),
    travellerEmail: String(traveller.traveler_email || ""),
    requesterEmail: String(item.requester_email || ""),
    travellerNationality: String(traveller.nationality || ""),
    company: String(company.company_name || "Company pending"),
    origin: String(travel.origin || "Origin pending"),
    destination,
    departDate: String(travel.depart_date || ""),
    returnDate: String(travel.return_date || ""),
    includeOutboundFlight: travel.include_outbound_flight !== false,
    includeReturnFlight: travel.include_return_flight !== false,
    includeHotel: travel.include_hotel !== false,
    purpose: String(travel.trip_purpose || ""),
    preferences: compactPreferenceText(preferences),
    budgetAmount: Number(budgets.total_budget || 0),
    budgetCurrency: currency,
    specialRequests: Array.isArray(item.special_requests) ? item.special_requests.join("; ") : "",
    criticalIssue: String(item.critical_issue || ""),
    criticalIssueStatus: item.critical_issue_status === "Urgent" || item.critical_issue_status === "Resolved" ? item.critical_issue_status : "None",
    status,
    visaStatus: checkFromText(readiness.visa_status),
    budgetStatus: checkFromText(budgetPolicy.budget_status),
    approvalStatus: approvalStatusFromBackend(plan?.approval_status, budgetPolicy.approval_required, status),
    lastUpdated: String(item.updated_at || item.created_at || new Date().toISOString()),
    originalRequest: originalRequestText(item),
    aiSummary: String(plan?.request_summary || "Generate the complete travel plan to summarize this request."),
    agentNotes,
    readinessCheck: readinessText(readiness),
    budgetPolicyCheck: budgetPolicyText(budgetPolicy),
    recommendedPlans: Array.isArray(plan?.travel_options)
      ? plan.travel_options.map((option: Record<string, any>, index: number) => ({
          id: `plan-${index + 1}`,
          name: String(option.option_name || `Option ${index + 1}`),
          flightOfferId: option.flight_offer_id ? String(option.flight_offer_id) : null,
          groundTransferOfferId: option.ground_transfer_offer_id ? String(option.ground_transfer_offer_id) : null,
          flightSummary: String(option.flight_summary || ""),
          hotelSummary: String(option.hotel_summary || ""),
          transferSummary: String(option.transfer_summary || ""),
          totalAmount: Number(option.estimated_cost || 0),
          currency,
          policyFit: String(option.policy_status || ""),
          tradeoffs: [
            Array.isArray(option.pros) && option.pros.length ? `Pros: ${option.pros.join(", ")}` : "",
            Array.isArray(option.cons) && option.cons.length ? `Cons: ${option.cons.join(", ")}` : "",
            option.recommendation_reason ? `Reason: ${option.recommendation_reason}` : ""
          ].filter(Boolean).join("\n"),
          selected: index === 0
        }))
      : [],
    flightOffers: flightOffers.map((offer: any) => ({ ...offer, selected: offer.id === selectedFlightOfferId })),
    selectedFlightOfferId,
    hotelOffers: hotelOffers.map((offer: any) => ({ ...offer, selected: offer.id === selectedHotelOfferId })),
    selectedHotelOfferId,
    groundTransferOffers: groundTransferOffers.map((offer: any) => ({ ...offer, selected: offer.id === selectedGroundTransferOfferId })),
    selectedGroundTransferOfferId,
    clientReview: mapCorporateClientReview(item.client_review),
    clientReviewHistory: Array.isArray(item.client_review_history) ? item.client_review_history.map(mapCorporateClientReviewEvent) : [],
    missingInformation: missing.join("\n"),
    customerMessageDraft: String(plan?.customer_message_draft || ""),
    finalItineraryDraft: String(plan?.customer_itinerary_draft || ""),
    finalApproved: status === "finalized"
  };
}

function mapCorporateFlightOffer(raw: Record<string, any>) {
  return {
    id: String(raw.id || ""),
    provider: String(raw.provider || "duffel"),
    airline: String(raw.airline || "Flight option"),
    summary: String(raw.summary || ""),
    totalAmount: Number(raw.total_amount || 0),
    currency: String(raw.currency || "USD"),
    outbound: String(raw.outbound || ""),
    returnLeg: raw.return_leg ? String(raw.return_leg) : null,
    cabin: String(raw.cabin || "economy") as any,
    expiresAt: raw.expires_at ? String(raw.expires_at) : null,
    source: raw.source === "duffel" ? "duffel" : "synthetic",
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
    selected: false
  };
}

function mapCorporateHotelOffer(raw: Record<string, any>) {
  return {
    id: String(raw.id || ""),
    provider: String(raw.provider || "booking"),
    name: String(raw.name || "Hotel option"),
    summary: String(raw.summary || ""),
    totalAmount: Number(raw.total_amount || 0),
    currency: String(raw.currency || "USD"),
    address: raw.address ? String(raw.address) : null,
    starRating: raw.star_rating === null || raw.star_rating === undefined ? null : Number(raw.star_rating),
    checkIn: raw.check_in ? String(raw.check_in) : null,
    checkOut: raw.check_out ? String(raw.check_out) : null,
    checkInStartsAt: raw.check_in_starts_at ? String(raw.check_in_starts_at) : null,
    checkoutTime: raw.checkout_time ? String(raw.checkout_time) : null,
    roomNotes: raw.room_notes ? String(raw.room_notes) : null,
    cancellationNotes: raw.cancellation_notes ? String(raw.cancellation_notes) : null,
    unsentSpecialRequests: Array.isArray(raw.unsent_special_requests) ? raw.unsent_special_requests.map(String) : [],
    nights: Number(raw.nights || 1),
    rooms: Number(raw.rooms || 1),
    guests: Number(raw.guests || 1),
    imageUrl: raw.image_url ? String(raw.image_url) : null,
    source: raw.source === "booking" ? "booking" : "synthetic",
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
    selected: false
  };
}

function mapCorporateGroundTransferOffer(raw: Record<string, any>): CorporateGroundTransferOffer {
  return {
    id: String(raw.id || ""),
    provider: String(raw.provider || "Planning transfer provider"),
    offerId: raw.offer_id ? String(raw.offer_id) : null,
    pickupAirportCode: String(raw.pickup_airport_code || "Airport pending"),
    pickupTime: raw.pickup_time ? String(raw.pickup_time) : null,
    dropoffLabel: String(raw.dropoff_label || "Dropoff pending"),
    dropoffAddress: raw.dropoff_address ? String(raw.dropoff_address) : null,
    serviceType: String(raw.service_type || "PRIVATE"),
    vehicleType: raw.vehicle_type ? String(raw.vehicle_type) : null,
    passengers: Number(raw.passengers || 1),
    baggage: raw.baggage ? String(raw.baggage) : null,
    totalAmount: Number(raw.total_amount || 0),
    currency: String(raw.currency || "USD"),
    cancellationNotes: raw.cancellation_notes ? String(raw.cancellation_notes) : null,
    source: raw.source === "amadeus" ? "amadeus" : "synthetic",
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
    selected: false
  };
}

function mapCorporateClientReview(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, any>;
  return {
    status: clientReviewStatus(item.status),
    reviewUrl: item.review_url ? String(item.review_url) : null,
    selectedOptionIndex: item.selected_option_index === null || item.selected_option_index === undefined ? null : Number(item.selected_option_index),
    editRequestText: item.edit_request_text ? String(item.edit_request_text) : null,
    revisionRound: Number(item.revision_round || 0),
    changeSummary: item.change_summary ? String(item.change_summary) : null,
    expiresAt: item.expires_at ? String(item.expires_at) : null,
    sentAt: item.sent_at ? String(item.sent_at) : null,
    submittedAt: item.submitted_at ? String(item.submitted_at) : null
  };
}

function mapCorporateClientReviewEvent(raw: Record<string, any>): CorporateClientReviewEvent {
  return {
    id: String(raw.id || ""),
    action: raw.action === "approved" || raw.action === "cancelled" || raw.action === "edits_requested" || raw.action === "agent_review_required" ? raw.action : "sent",
    revisionRound: Number(raw.revision_round || 0),
    selectedOptionIndex: raw.selected_option_index === null || raw.selected_option_index === undefined ? null : Number(raw.selected_option_index),
    editRequestText: raw.edit_request_text ? String(raw.edit_request_text) : null,
    changeSummary: raw.change_summary ? String(raw.change_summary) : null,
    createdAt: String(raw.created_at || new Date().toISOString())
  };
}

function clientReviewStatus(value: unknown) {
  const status = String(value || "Not Sent");
  if (["Sent", "Changes Requested", "Approved", "Cancelled", "Agent Review Required", "Expired"].includes(status)) return status as any;
  return "Not Sent";
}

function mapClientReviewResponse(raw: unknown): ClientReviewResponse {
  const item = raw as Record<string, any>;
  return {
    requestId: String(item.request_id || ""),
    travelerName: String(item.traveler_name || "Traveler"),
    companyName: String(item.company_name || "Company"),
    route: String(item.route || ""),
    departDate: item.depart_date ? String(item.depart_date) : null,
    returnDate: item.return_date ? String(item.return_date) : null,
    status: clientReviewStatus(item.status),
    revisionRound: Number(item.revision_round || 0),
    expiresAt: item.expires_at ? String(item.expires_at) : null,
    submittedAt: item.submitted_at ? String(item.submitted_at) : null,
    changeSummary: item.change_summary ? String(item.change_summary) : null,
    specialRequestNotice: String(item.special_request_notice || ""),
    options: Array.isArray(item.options) ? item.options.map((option: Record<string, any>) => ({
      optionIndex: Number(option.option_index || 0),
      optionName: String(option.option_name || ""),
      flightSummary: String(option.flight_summary || ""),
      hotelSummary: String(option.hotel_summary || ""),
      transferSummary: String(option.transfer_summary || ""),
      estimatedCost: Number(option.estimated_cost || 0),
      currency: String(option.currency || "USD"),
      maximumBudget: option.maximum_budget === null || option.maximum_budget === undefined ? null : Number(option.maximum_budget || 0),
      budgetDelta: option.budget_delta === null || option.budget_delta === undefined ? null : Number(option.budget_delta || 0),
      policyStatus: String(option.policy_status || ""),
      recommendationReason: String(option.recommendation_reason || ""),
      reasoningSourceLabel: String(option.reasoning_source_label || "Reason from the submitted request"),
      pros: Array.isArray(option.pros) ? option.pros.map(String) : [],
      cons: Array.isArray(option.cons) ? option.cons.map(String) : [],
      flight: option.flight ? {
        id: String(option.flight.id || ""),
        airline: String(option.flight.airline || ""),
        airlineCode: option.flight.airline_code ? String(option.flight.airline_code) : null,
        airlineLogoUrl: option.flight.airline_logo_url ? String(option.flight.airline_logo_url) : null,
        summary: String(option.flight.summary || ""),
        outbound: String(option.flight.outbound || ""),
        returnLeg: option.flight.return_leg ? String(option.flight.return_leg) : null,
        cabin: String(option.flight.cabin || "economy") as any,
        totalAmount: Number(option.flight.total_amount || 0),
        currency: String(option.flight.currency || "USD"),
        source: option.flight.source === "duffel" ? "duffel" : "synthetic",
        notes: Array.isArray(option.flight.notes) ? option.flight.notes.map(String) : []
      } : null,
      hotel: option.hotel ? {
        id: String(option.hotel.id || ""),
        name: String(option.hotel.name || ""),
        summary: String(option.hotel.summary || ""),
        address: option.hotel.address ? String(option.hotel.address) : null,
        checkIn: option.hotel.check_in ? String(option.hotel.check_in) : null,
        checkOut: option.hotel.check_out ? String(option.hotel.check_out) : null,
        checkInStartsAt: option.hotel.check_in_starts_at ? String(option.hotel.check_in_starts_at) : null,
        checkoutTime: option.hotel.checkout_time ? String(option.hotel.checkout_time) : null,
        roomNotes: option.hotel.room_notes ? String(option.hotel.room_notes) : null,
        cancellationNotes: option.hotel.cancellation_notes ? String(option.hotel.cancellation_notes) : null,
        unsentSpecialRequests: Array.isArray(option.hotel.unsent_special_requests) ? option.hotel.unsent_special_requests.map(String) : [],
        totalAmount: Number(option.hotel.total_amount || 0),
        currency: String(option.hotel.currency || "USD"),
        imageUrl: option.hotel.image_url ? String(option.hotel.image_url) : null
      } : null,
      transfer: option.transfer ? {
        id: String(option.transfer.id || ""),
        pickupAirportCode: String(option.transfer.pickup_airport_code || ""),
        pickupTime: option.transfer.pickup_time ? String(option.transfer.pickup_time) : null,
        dropoffLabel: String(option.transfer.dropoff_label || ""),
        dropoffAddress: option.transfer.dropoff_address ? String(option.transfer.dropoff_address) : null,
        serviceType: String(option.transfer.service_type || ""),
        vehicleType: option.transfer.vehicle_type ? String(option.transfer.vehicle_type) : null,
        passengers: Number(option.transfer.passengers || 1),
        baggage: option.transfer.baggage ? String(option.transfer.baggage) : null,
        totalAmount: Number(option.transfer.total_amount || 0),
        currency: String(option.transfer.currency || "USD"),
        cancellationNotes: option.transfer.cancellation_notes ? String(option.transfer.cancellation_notes) : null,
        notes: Array.isArray(option.transfer.notes) ? option.transfer.notes.map(String) : []
      } : null
    })) : [],
    history: Array.isArray(item.history) ? item.history.map(mapCorporateClientReviewEvent) : []
  };
}

function mapCorporateUploadResponse(raw: unknown): CorporateUploadResponse {
  const item = raw as Record<string, any>;
  const ids = Array.isArray(item.created_request_ids) ? item.created_request_ids : [];
  const createdRequests = Number(item.request_count || ids.length || 0);
  const contextRows = Number(item.traveller_history_count || 0) + Number(item.employee_profile_count || 0) + Number(item.visa_rule_count || 0) + Number(item.policy_count || 0);
  return {
    totalRows: createdRequests + contextRows,
    createdRequests,
    skippedRows: 0,
    employeeProfiles: Number(item.employee_profile_count || 0),
    requests: ids.map((id: string) => ({
      ...emptyCorporateRequest(),
      id,
      originalRequest: `Imported request ${id}`,
      lastUpdated: new Date().toISOString()
    }))
  };
}

function mapCompanyPipelineStatus(raw: unknown): CompanyPipelineStatus {
  const item = raw as Record<string, any>;
  return {
    companyName: String(item.company_name || "Company pending"),
    travelerCount: Number(item.traveler_count || 0),
    travelerListStatus: item.traveler_list_status === "Updated" ? "Updated" : "Missing",
    policyStatus: item.policy_status === "Uploaded" ? "Uploaded" : "Missing",
    policyCount: Number(item.policy_count || 0),
    visaRecordCount: Number(item.visa_record_count || 0),
    historyRowCount: Number(item.history_row_count || 0)
  };
}

function mapCompanyPolicyImportResponse(raw: unknown): CompanyPolicyImportResponse {
  const item = raw as Record<string, any>;
  return {
    companyName: String(item.company_name || "Company pending"),
    policyCount: Number(item.policy_count || 0),
    rules: Array.isArray(item.rules) ? item.rules.map(String).filter(Boolean) : []
  };
}

function mapCorporateAdminSummary(raw: unknown): CorporateAdminSummary {
  const item = raw as Record<string, any>;
  const byStatus = item.by_status || {};
  return {
    totalRequests: Number(item.total_requests ?? 0),
    newRequests: Number(byStatus.New ?? 0),
    pendingApprovals: Number(item.approval_required ?? byStatus.Processing ?? byStatus["Waiting for Approval"] ?? 0),
    missingInfo: Number(byStatus["Pending Details"] ?? byStatus["Missing Info"] ?? 0),
    visaIssues: Number(item.visa_issues ?? 0),
    finalizedItineraries: Number(item.finalized ?? byStatus.Completed ?? byStatus.Finalized ?? 0),
    averageHandlingTimeHours: Number(item.average_handling_time_hours ?? 0),
    commonDestinations: Array.isArray(item.common_destinations)
      ? item.common_destinations.map((entry: Record<string, any>) => ({
          destination: String(entry.destination || ""),
          count: Number(entry.count || 0)
        })).filter((entry: { destination: string; count: number }) => entry.destination)
      : []
  };
}

function toBackendCorporatePlan(update: CorporateRequestUpdate) {
  const options = update.recommendedPlans || [];
  const total = options[0]?.totalAmount || 0;
  const approvalRequired = update.approvalStatus === "Required" || update.approvalStatus === "Rejected";
  const readiness = compactReadinessForBackend(update.readinessCheck || "");

  return {
    request_summary: update.aiSummary || "Agent-edited corporate travel plan.",
    missing_information: splitLines(update.missingInformation || ""),
    travel_readiness: {
      passport_status: readiness.passport_status,
      visa_status: readiness.visa_status,
      transit_warning: readiness.transit_warning,
      document_notes: readiness.document_notes
    },
    budget_policy_check: {
      budget_status: "Not Applied",
      policy_status: approvalRequired ? "Needs Approval" : "Compliant",
      approval_required: approvalRequired,
      approval_reason: update.budgetPolicyCheck || (approvalRequired ? "Agent review required." : "No approval required."),
      estimated_cost: total,
      total_budget: null
    },
    travel_options: [0, 1, 2].map((index) => {
      const option = (options[index] || options[0] || {}) as Partial<NonNullable<CorporateRequestUpdate["recommendedPlans"]>[number]>;
      return {
        option_name: backendOptionName(option.name, index),
        flight_offer_id: option.flightOfferId || null,
        ground_transfer_offer_id: option.groundTransferOfferId || null,
        flight_summary: option.flightSummary || "Flight option pending",
        hotel_summary: option.hotelSummary || "Hotel option pending",
        transfer_summary: option.transferSummary || "Airport transfer pending",
        estimated_cost: Number(option.totalAmount || total || 1),
        pros: splitLines(option.tradeoffs || "").slice(0, 2),
        cons: [],
        policy_status: option.policyFit || "Needs Review",
        recommendation_reason: option.tradeoffs || "Agent-edited recommendation."
      };
    }),
    flight_offers: (update.flightOffers || []).map((offer) => ({
      id: offer.id,
      provider: offer.provider,
      airline: offer.airline,
      summary: offer.summary,
      total_amount: offer.totalAmount,
      currency: offer.currency,
      outbound: offer.outbound,
      return_leg: offer.returnLeg || null,
      cabin: offer.cabin,
      expires_at: offer.expiresAt || null,
      source: offer.source,
      notes: offer.notes
    })),
    selected_flight_offer_id: update.selectedFlightOfferId || update.flightOffers?.find((offer) => offer.selected)?.id || null,
    hotel_offers: (update.hotelOffers || []).map((offer) => ({
      id: offer.id,
      provider: offer.provider,
      name: offer.name,
      summary: offer.summary,
      total_amount: offer.totalAmount,
      currency: offer.currency,
      address: offer.address || null,
      star_rating: offer.starRating || null,
      check_in: offer.checkIn || null,
      check_out: offer.checkOut || null,
      check_in_starts_at: offer.checkInStartsAt || null,
      checkout_time: offer.checkoutTime || null,
      room_notes: offer.roomNotes || null,
      cancellation_notes: offer.cancellationNotes || null,
      unsent_special_requests: offer.unsentSpecialRequests || [],
      nights: offer.nights,
      rooms: offer.rooms,
      guests: offer.guests,
      image_url: offer.imageUrl || null,
      source: offer.source,
      notes: offer.notes
    })),
    selected_hotel_offer_id: update.selectedHotelOfferId || update.hotelOffers?.find((offer) => offer.selected)?.id || null,
    ground_transfer_offers: (update.groundTransferOffers || []).map((offer) => ({
      id: offer.id,
      provider: offer.provider,
      offer_id: offer.offerId || null,
      pickup_airport_code: offer.pickupAirportCode,
      pickup_time: offer.pickupTime || null,
      dropoff_label: offer.dropoffLabel,
      dropoff_address: offer.dropoffAddress || null,
      service_type: offer.serviceType,
      vehicle_type: offer.vehicleType || null,
      passengers: offer.passengers,
      baggage: offer.baggage || null,
      total_amount: offer.totalAmount,
      currency: offer.currency,
      cancellation_notes: offer.cancellationNotes || null,
      source: offer.source,
      notes: offer.notes
    })),
    selected_ground_transfer_offer_id: update.selectedGroundTransferOfferId || update.groundTransferOffers?.find((offer) => offer.selected)?.id || null,
    agent_note: update.budgetPolicyCheck || "Agent edited the generated output.",
    agent_notes: splitLines(update.budgetPolicyCheck || ""),
    customer_message_draft: update.customerMessageDraft || "",
    customer_itinerary_draft: update.finalItineraryDraft || "",
    approval_status: backendStatusFromFrontend(update.status)
  };
}

function approvalStatusFromBackend(value: unknown, approvalRequired: boolean, status: CorporateTravelRequest["status"]): CorporateTravelRequest["approvalStatus"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "received") return "Received";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "not required" || normalized === "not_required") return "Not Required";
  if (normalized === "required") return "Required";
  if (status === "finalized") return "Received";
  return approvalRequired ? "Required" : "Not Required";
}

function frontendStatusFromBackend(status: unknown): CorporateTravelRequest["status"] {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pending details" || normalized === "missing info") return "missing_info";
  if (normalized === "processing") return "processing";
  if (normalized === "waiting for approval") return "pending_approval";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "completed" || normalized === "finalized") return "finalized";
  if (normalized === "ready for planning" || normalized === "plan generated") return "planning";
  return "new";
}

function backendStatusFromFrontend(status: CorporateRequestUpdate["status"]): string {
  if (status === "missing_info") return "Missing Info";
  if (status === "processing") return "Processing";
  if (status === "pending_approval") return "Waiting for Approval";
  if (status === "finalized") return "Finalized";
  if (status === "cancelled") return "Cancelled";
  if (status === "planning") return "Plan Generated";
  return "Plan Generated";
}

function checkFromText(value: unknown): CorporateTravelRequest["visaStatus"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("blocking") || normalized.includes("out of budget") || normalized.includes("violation")) return "blocked";
  if (normalized.includes("approval") || normalized.includes("review") || normalized.includes("missing")) return "attention";
  if (normalized.includes("ready") || normalized.includes("within") || normalized.includes("compliant")) return "clear";
  return "pending";
}

function backendOptionName(name: unknown, index: number) {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("fast")) return "Fastest route";
  if (normalized.includes("comfort")) return "Comfort-focused option";
  if (normalized.includes("tier") || normalized.includes("policy") || normalized.includes("lowest")) return "Best tier fit";
  return index === 1 ? "Fastest route" : index === 2 ? "Comfort-focused option" : "Best tier fit";
}

function originalRequestText(item: Record<string, any>) {
  const traveller = item.traveller_details || {};
  const company = item.company_details || {};
  const travel = item.travel_details || {};
  return [
    `Traveller: ${traveller.traveler_name || "Missing"} (${traveller.traveler_email || "email missing"})`,
    `Nationality: ${traveller.nationality || "Missing"}`,
    `Band: ${traveller.employee_band || traveller.employee_level || "Missing"}`,
    `Company: ${company.company_name || "Missing"}`,
    `Route: ${travel.origin || "Missing"} to ${travel.destination || travel.destination_country || "Missing"}`,
    `Dates: ${travel.depart_date || "Missing"} to ${travel.return_date || "Missing"}`,
    `Purpose: ${travel.trip_purpose || "Missing"}`
  ].join("\n");
}

function readinessText(readiness: Record<string, any>) {
  return compactReadinessText([
    `Passport: ${readiness.passport_status || "Needs Review"}`,
    `Visa: ${readiness.visa_status || "Needs Review"}`,
    `Transit: ${readiness.transit_warning || "Needs Review"}`,
    ...(Array.isArray(readiness.document_notes) ? readiness.document_notes : [])
  ].join("\n"));
}

function budgetPolicyText(check: Record<string, any>) {
  return [
    `Policy: ${check.policy_status || "Needs Review"}`,
    `Estimated cost: ${check.estimated_cost || "Not calculated"}`,
    `Approval: ${check.approval_required ? "Required" : "Not required"}`,
    check.approval_reason || ""
  ].filter(Boolean).join("\n");
}

function splitLines(value: string) {
  return value
    .split(/\n|;|\.\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactPreferenceText(preferences: Record<string, any>) {
  return uniquePieces([
    preferences.preferred_airline,
    preferences.flight_preference,
    preferences.hotel_preference,
    preferences.meal_preference,
    preferences.seat_preference,
    preferences.timing_preference
  ]).join("; ");
}

function compactReadinessForBackend(value: string) {
  const compact = compactReadinessText(value);
  return {
    passport_status: readinessField(compact, "Passport") || "Needs Review",
    visa_status: readinessField(compact, "Visa") || "Needs Review",
    transit_warning: readinessField(compact, "Transit") || "Needs Review",
    document_notes: splitLines(compact)
      .filter((line) => !/^(passport|visa|transit):/i.test(line))
      .slice(0, 4)
  };
}

function compactReadinessText(value: string) {
  const passport = readinessField(value, "Passport");
  const visa = readinessField(value, "Visa");
  const transit = readinessField(value, "Transit");
  const notes = splitLines(value)
    .filter((line) => !/^(passport|visa|transit):/i.test(line))
    .filter((line) => !/(passport|visa|transit):/i.test(line))
    .slice(0, 3);
  return [
    `Passport: ${passport || "Needs Review"}`,
    `Visa: ${visa || "Needs Review"}`,
    `Transit: ${transit || "Needs Review"}`,
    ...notes
  ].join("\n");
}

function readinessField(value: string, label: "Passport" | "Visa" | "Transit") {
  const match = value.match(new RegExp(`${label}:\\s*([^\\n]*?)(?=\\s+(?:Passport|Visa|Transit):|\\n|$)`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/\b(Passport|Visa|Transit):\s*/gi, "")
    .split(/\s{2,}|\.|;|\b(?:Passport|Visa|Transit):/)[0]
    .trim()
    .slice(0, 120);
}

function uniquePieces(values: unknown[]) {
  const seen = new Set<string>();
  const pieces: string[] = [];
  for (const value of values) {
    for (const piece of String(value || "").split(/;|\n/).map((item) => item.trim()).filter(Boolean)) {
      const key = piece.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      pieces.push(piece);
    }
  }
  return pieces;
}

function emptyCorporateRequest(): CorporateTravelRequest {
  return {
    id: "",
    travellerName: "Imported traveller",
    travellerEmail: "",
    requesterEmail: "",
    travellerNationality: "",
    company: "",
    origin: "",
    destination: "",
    departDate: "",
    returnDate: "",
    includeOutboundFlight: true,
    includeReturnFlight: true,
    includeHotel: true,
    purpose: "",
    preferences: "",
    budgetAmount: 0,
    budgetCurrency: "INR",
    specialRequests: "",
    criticalIssue: "",
    criticalIssueStatus: "None",
    status: "new",
    visaStatus: "pending",
    budgetStatus: "pending",
    approvalStatus: "Not Required",
    lastUpdated: "",
    originalRequest: "",
    aiSummary: "",
    agentNotes: [],
    readinessCheck: "",
    budgetPolicyCheck: "",
    recommendedPlans: [],
    flightOffers: [],
    selectedFlightOfferId: null,
    hotelOffers: [],
    selectedHotelOfferId: null,
    groundTransferOffers: [],
    selectedGroundTransferOfferId: null,
    clientReview: null,
    clientReviewHistory: [],
    missingInformation: "",
    customerMessageDraft: "",
    finalItineraryDraft: "",
    finalApproved: false
  };
}
