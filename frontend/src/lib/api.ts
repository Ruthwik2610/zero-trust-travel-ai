import type {
  AdminSummary,
  AuditEvent,
  AuthContext,
  AuthTokenResponse,
  CorporateAdminSummary,
  CorporateCreateRequest,
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
const USER_EMAIL_KEY = "travel_ai_user_email";

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

function storedEmail() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(USER_EMAIL_KEY) || "";
}

async function refreshDemoSession() {
  if (typeof window === "undefined") return false;
  const email = storedEmail();
  clearAuthSession();
  if (!email) return false;
  const session = await demoLogin(email);
  storeAuthSession(session);
  return true;
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
    throw new Error("Travel service request failed");
  }

  return response.json() as Promise<T>;
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
  window.localStorage.setItem(USER_EMAIL_KEY, session.user.email);
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(AUTH_CONTEXT_KEY);
}

export function checkHealth() {
  return request<{ status: string }>("/health");
}

export function demoLogin(email: string) {
  return request<AuthTokenResponse>("/api/auth/demo-login", {
    method: "POST",
    retryAuth: false,
    body: JSON.stringify({ email })
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
    purpose: "review aggregate travel budget and policy posture"
  });
}

export function getAuditEvents() {
  return request<AuditEvent[]>("/api/admin/audit", {
    purpose: "review security audit events"
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

export function updateCorporateRequest(id: string, payload: CorporateRequestUpdate) {
  return request<unknown>(`/api/corporate/requests/${encodeURIComponent(id)}/plan`, {
    method: "PUT",
    purpose: "update corporate travel request draft",
    body: JSON.stringify({ generated_plan: toBackendCorporatePlan(payload) })
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
    purpose: "upload corporate travel requests from excel",
    body: formData
  }).then(mapCorporateUploadResponse);
}

export function downloadCorporateExcelTemplate() {
  return requestBlob("/api/corporate/excel-template", {
    purpose: "download corporate travel excel template"
  });
}

export function downloadCorporateRequestExcel(id: string) {
  return requestBlob(`/api/corporate/requests/${encodeURIComponent(id)}/export.xlsx`, {
    purpose: "download finalized corporate travel itinerary excel"
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
  kind: "approval_request" | "document_update" | "final_itinerary";
  to: string[];
  cc?: string[];
  note?: string;
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
      traveler_email: payload.travellerEmail
    },
    company_details: {
      company_name: payload.company
    },
    travel_details: {
      origin: payload.origin,
      destination: payload.destination,
      depart_date: payload.departDate || null,
      return_date: payload.returnDate || null,
      trip_purpose: payload.purpose,
      travelers: 1,
      cabin: "economy"
    },
    preferences: {
      hotel_preference: payload.preferences,
      timing_preference: payload.preferences
    },
    budgets: {
      total_budget: Number(payload.budgetAmount) || null,
      currency: payload.budgetCurrency || "INR"
    },
    special_requests: splitLines(payload.specialRequests),
    status: "New"
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
  const currency = String(budgets.currency || "INR");
  const destination = String(travel.destination || travel.destination_country || "Destination pending");
  const status = frontendStatusFromBackend(item.status);
  const missing = Array.isArray(plan?.missing_information) ? plan.missing_information : [];

  return {
    id: String(item.id || ""),
    travellerName: String(traveller.traveler_name || "Traveller pending"),
    travellerEmail: String(traveller.traveler_email || ""),
    company: String(company.company_name || "Company pending"),
    origin: String(travel.origin || "Origin pending"),
    destination,
    departDate: String(travel.depart_date || ""),
    returnDate: String(travel.return_date || ""),
    purpose: String(travel.trip_purpose || ""),
    preferences: [
      preferences.preferred_airline && `Airline: ${preferences.preferred_airline}`,
      preferences.hotel_preference && `Hotel: ${preferences.hotel_preference}`,
      preferences.meal_preference && `Meal: ${preferences.meal_preference}`,
      preferences.seat_preference && `Seat: ${preferences.seat_preference}`,
      preferences.timing_preference && `Timing: ${preferences.timing_preference}`
    ].filter(Boolean).join("; "),
    budgetAmount: Number(budgets.total_budget || 0),
    budgetCurrency: currency,
    specialRequests: Array.isArray(item.special_requests) ? item.special_requests.join("; ") : "",
    status,
    visaStatus: checkFromText(readiness.visa_status),
    budgetStatus: checkFromText(budgetPolicy.budget_status),
    approvalStatus: approvalStatusFromBackend(plan?.approval_status, budgetPolicy.approval_required, status),
    lastUpdated: String(item.updated_at || item.created_at || new Date().toISOString()),
    originalRequest: originalRequestText(item),
    aiSummary: String(plan?.request_summary || "Generate the complete travel plan to summarize this request."),
    readinessCheck: readinessText(readiness),
    budgetPolicyCheck: budgetPolicyText(budgetPolicy),
    recommendedPlans: Array.isArray(plan?.travel_options)
      ? plan.travel_options.map((option: Record<string, any>, index: number) => ({
          id: `plan-${index + 1}`,
          name: String(option.option_name || `Option ${index + 1}`),
          flightSummary: String(option.flight_summary || ""),
          hotelSummary: String(option.hotel_summary || ""),
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
    missingInformation: missing.join("\n"),
    customerMessageDraft: String(plan?.customer_message_draft || ""),
    finalItineraryDraft: String(plan?.customer_itinerary_draft || ""),
    finalApproved: status === "finalized"
  };
}

function mapCorporateUploadResponse(raw: unknown): CorporateUploadResponse {
  const item = raw as Record<string, any>;
  const ids = Array.isArray(item.created_request_ids) ? item.created_request_ids : [];
  return {
    totalRows: Number(item.request_count || ids.length || 0),
    createdRequests: Number(item.request_count || ids.length || 0),
    skippedRows: 0,
    requests: ids.map((id: string) => ({
      ...emptyCorporateRequest(),
      id,
      originalRequest: `Imported request ${id}`,
      lastUpdated: new Date().toISOString()
    }))
  };
}

function mapCorporateAdminSummary(raw: unknown): CorporateAdminSummary {
  const item = raw as Record<string, any>;
  const byStatus = item.by_status || {};
  return {
    totalRequests: Number(item.total_requests || 0),
    newRequests: Number(byStatus.New || 0),
    pendingApprovals: Number(item.approval_required || byStatus["Waiting for Approval"] || 0),
    missingInfo: Number(byStatus["Missing Info"] || 0),
    visaIssues: Number(item.visa_issues || 0),
    finalizedItineraries: Number(item.finalized || byStatus.Finalized || 0),
    averageHandlingTimeHours: Number(item.average_handling_time_hours || 0),
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
  const budgetStatus = update.budgetStatus || "pending";
  const approvalRequired = update.approvalStatus === "Required" || update.approvalStatus === "Rejected";

  return {
    request_summary: update.aiSummary || "Agent-edited corporate travel plan.",
    missing_information: splitLines(update.missingInformation || ""),
    travel_readiness: {
      passport_status: update.readinessCheck || "Needs Review",
      visa_status: update.readinessCheck || "Needs Review",
      transit_warning: "Needs Review",
      document_notes: splitLines(update.readinessCheck || "")
    },
    budget_policy_check: {
      budget_status: backendBudgetStatus(budgetStatus),
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
        flight_summary: option.flightSummary || "Flight option pending",
        hotel_summary: option.hotelSummary || "Hotel option pending",
        estimated_cost: Number(option.totalAmount || total || 1),
        pros: splitLines(option.tradeoffs || "").slice(0, 2),
        cons: [],
        policy_status: option.policyFit || "Needs Review",
        recommendation_reason: option.tradeoffs || "Agent-edited recommendation."
      };
    }),
    agent_note: update.budgetPolicyCheck || "Agent edited the generated output.",
    agent_notes: splitLines(update.budgetPolicyCheck || ""),
    customer_message_draft: update.customerMessageDraft || "",
    customer_itinerary_draft: update.finalItineraryDraft || "",
    approval_status: update.approvalStatus || backendStatusFromFrontend(update.status)
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
  if (normalized === "missing info") return "missing_info";
  if (normalized === "waiting for approval") return "pending_approval";
  if (normalized === "finalized") return "finalized";
  if (normalized === "ready for planning" || normalized === "plan generated") return "planning";
  return "new";
}

function backendStatusFromFrontend(status: CorporateRequestUpdate["status"]): string {
  if (status === "missing_info") return "Missing Info";
  if (status === "pending_approval") return "Waiting for Approval";
  if (status === "finalized") return "Finalized";
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

function backendBudgetStatus(status: CorporateRequestUpdate["budgetStatus"]) {
  if (status === "clear") return "Within Budget";
  if (status === "blocked") return "Out of Budget";
  if (status === "attention") return "Needs Approval";
  return "Needs Review";
}

function backendOptionName(name: unknown, index: number) {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("fast")) return "Fastest route";
  if (normalized.includes("comfort")) return "Comfort-focused option";
  if (normalized.includes("budget") || normalized.includes("policy") || normalized.includes("lowest")) return "Best within budget";
  return index === 1 ? "Fastest route" : index === 2 ? "Comfort-focused option" : "Best within budget";
}

function originalRequestText(item: Record<string, any>) {
  const traveller = item.traveller_details || {};
  const company = item.company_details || {};
  const travel = item.travel_details || {};
  const budget = item.budgets || {};
  return [
    `Traveller: ${traveller.traveler_name || "Missing"} (${traveller.traveler_email || "email missing"})`,
    `Company: ${company.company_name || "Missing"}`,
    `Route: ${travel.origin || "Missing"} to ${travel.destination || travel.destination_country || "Missing"}`,
    `Dates: ${travel.depart_date || "Missing"} to ${travel.return_date || "Missing"}`,
    `Purpose: ${travel.trip_purpose || "Missing"}`,
    `Budget: ${budget.total_budget || "Missing"} ${budget.currency || ""}`
  ].join("\n");
}

function readinessText(readiness: Record<string, any>) {
  return [
    `Passport: ${readiness.passport_status || "Needs Review"}`,
    `Visa: ${readiness.visa_status || "Needs Review"}`,
    `Transit: ${readiness.transit_warning || "Needs Review"}`,
    ...(Array.isArray(readiness.document_notes) ? readiness.document_notes : [])
  ].join("\n");
}

function budgetPolicyText(check: Record<string, any>) {
  return [
    `Budget: ${check.budget_status || "Needs Review"}`,
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

function emptyCorporateRequest(): CorporateTravelRequest {
  return {
    id: "",
    travellerName: "Imported traveller",
    travellerEmail: "",
    company: "",
    origin: "",
    destination: "",
    departDate: "",
    returnDate: "",
    purpose: "",
    preferences: "",
    budgetAmount: 0,
    budgetCurrency: "INR",
    specialRequests: "",
    status: "new",
    visaStatus: "pending",
    budgetStatus: "pending",
    approvalStatus: "Not Required",
    lastUpdated: "",
    originalRequest: "",
    aiSummary: "",
    readinessCheck: "",
    budgetPolicyCheck: "",
    recommendedPlans: [],
    missingInformation: "",
    customerMessageDraft: "",
    finalItineraryDraft: "",
    finalApproved: false
  };
}
