"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Trash2,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  IdCard,
  Info,
  Lock,
  MessageSquare,
  Moon,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  User,
  Users as UsersIcon,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  chatWithAssistant,
  clearAuthSession,
  createCorporateRequest,
  demoLogin,
  deleteCorporateRequest,
  downloadClientRequestFormDocx,
  downloadCorporateExcelTemplate,
  downloadCorporateRequestPdf,
  finalizeCorporateRequest,
  generateCorporateTravelPlan,
  getAuditEvents,
  getCorporateAdminSummary,
  getEmailEvents,
  getStoredAuthContext,
  getPolicy,
  getTraveler,
  listCompanyPipelineStatuses,
  listCorporateRequests,
  listPolicies,
  listPolicyActivity,
  listPolicyVersions,
  listTravelers,
  approvePolicyRevision,
  requestPolicyRevisionChanges,
  runCorporateRequestPipeline,
  saveTravelerProfile,
  sendCorporateRequestNotification,
  storeAuthSession,
  updateCorporateCriticalIssue,
  updateCorporateRequest,
  uploadCompanyPolicyPdf,
  getClientReview,
  submitClientReview,
  uploadCorporateRequests
} from "@/lib/api";
import type {
  AuthContext,
  AuditEvent,
  ClientReviewOption,
  ClientReviewResponse,
  CompanyPipelineStatus,
  CompanyPolicyImportResponse,
  CorporateAdminSummary,
  CorporateCreateRequest,
  CorporateFlightOffer,
  CorporateGroundTransferOffer,
  CorporateHotelOffer,
  CorporatePlanOption,
  CorporateRequestUpdate,
  CorporateRole,
  CorporateTravelRequest,
  CorporateUploadResponse,
  EmailEvent,
  PolicyActivityEvent,
  PolicyGroup,
  PolicyRevision,
  Trip,
  TravelerProfile
} from "@/lib/types";

type QueueFilter = "new_entries" | "needs_details" | "processing" | "completed";
type RosterReviewKind = "registration" | "profile_update";
type RosterReviewItem = {
  id: string;
  kind: RosterReviewKind;
  travelerName: string;
  travelerEmail: string;
  company: string;
  source: string;
  summary: string;
  extractedFields: string[];
};

const DEFAULT_EMAIL = "demo.agent@unipro.com";
const DEFAULT_PASSWORD = "travel-demo-2026";
const SELECTED_ROLE_KEY = "travel_ai_selected_role";
const USER_EMAIL_KEY = "travel_ai_user_email";

const ROLE_ACCOUNTS: Record<CorporateRole, { label: string; email: string; username: string; description: string; path: string; icon: LucideIcon }> = {
  admin: {
    label: "Application Admin",
    email: "admin.user@unipro.com",
    username: "admin",
    description: "Import policy, traveler history, and visa rules.",
    path: "/admin",
    icon: ShieldCheck
  },
  agent: {
    label: "Travel Agent",
    email: "demo.agent@unipro.com",
    username: "agent",
    description: "Plan, review, and finalize itineraries.",
    path: "/dashboard",
    icon: Plane
  }
};

const EMPTY_FORM: CorporateCreateRequest = {
  travellerName: "",
  employeeBand: "",
  origin: "",
  destination: "",
  departDate: "",
  returnDate: "",
  includeOutboundFlight: true,
  includeReturnFlight: true,
  includeHotel: true,
  preferences: "",
  specialRequests: ""
};

const PREFERENCE_OPTIONS = [
  "Aisle seat",
  "Window seat",
  "Vegetarian meal",
  "Non-veg meal",
  "Direct flights",
  "Hotel near office",
  "Morning flights"
];

const SPECIAL_REQUEST_OPTIONS = [
  "Airport pickup",
  "Extra baggage",
  "Wheelchair assistance",
  "Late check-in",
  "Early check-in",
  "Quiet room"
];

const INITIAL_ROSTER_REVIEW_ITEMS: RosterReviewItem[] = [
  {
    id: "registration-ananya-shah",
    kind: "registration",
    travelerName: "Ananya Shah",
    travelerEmail: "ananya.shah@orbitex.example",
    company: "Orbitex",
    source: "New registration form",
    summary: "LLM classified this as a new traveler registration from a submitted form.",
    extractedFields: ["Mumbai home office", "Window seat", "Vegetarian meal", "Passport on file pending verification"]
  },
  {
    id: "update-vikram-rao",
    kind: "profile_update",
    travelerName: "Vikram Rao",
    travelerEmail: "vikram.rao@example.com",
    company: "Unipro",
    source: "Traveler update form",
    summary: "LLM classified this as a profile update for reusable traveler data.",
    extractedFields: ["Passport renewed", "Known traveler number added", "Hotel preference updated"]
  }
];

function getStoredRole(): CorporateRole {
  if (typeof window === "undefined") return "agent";
  const stored = window.localStorage.getItem(SELECTED_ROLE_KEY);
  return stored === "admin" || stored === "agent" ? stored : "agent";
}

function getStoredEmail() {
  if (typeof window === "undefined") return DEFAULT_EMAIL;
  return window.localStorage.getItem(USER_EMAIL_KEY) || DEFAULT_EMAIL;
}

function isAdminContext(auth: AuthContext | null, selectedRole: CorporateRole) {
  if (!auth) return false;
  return selectedRole === "admin" && (auth.role === "travel_manager" || auth.role === "finance_admin" || auth.scopes.includes("admin:summary"));
}

function travelerFromReviewItem(item: RosterReviewItem): TravelerProfile {
  const now = new Date().toISOString();
  return {
    id: `traveler_${item.travelerEmail.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
    name: item.travelerName,
    email: item.travelerEmail,
    company: item.company,
    department: null,
    vip_level: null,
    status: item.kind === "profile_update" ? "Document Update Required" : "Compliant",
    location: null,
    seat_preference: item.extractedFields.find((field) => /seat/i.test(field)) || null,
    meal_preference: item.extractedFields.find((field) => /meal/i.test(field)) || null,
    hotel_preference: item.extractedFields.find((field) => /hotel/i.test(field)) || null,
    policy_notes: [],
    loyalty_programs: item.extractedFields.some((field) => /known traveler/i.test(field))
      ? [{ provider: "Known Traveler", tier: "On file", account_ref: "Pending review" }]
      : [],
    documents: [
      {
        document_type: "passport",
        label: "Passport",
        status: item.extractedFields.some((field) => /passport/i.test(field)) ? "Needs Review" : "Missing",
        redacted_value: item.extractedFields.some((field) => /passport/i.test(field)) ? "Submitted by form" : null
      }
    ],
    recent_trips: [],
    created_at: now,
    updated_at: now
  };
}

function pendingRosterReviewItems(reviewItems: RosterReviewItem[], travelers: TravelerProfile[]) {
  const travelerEmails = new Set(travelers.map((traveler) => traveler.email.toLowerCase()));
  return reviewItems.filter((item) => item.kind !== "registration" || !travelerEmails.has(item.travelerEmail.toLowerCase()));
}

function navigateAfterLogin(path: string) {
  if (process.env.NODE_ENV === "test") {
    window.history.pushState({}, "", path);
    return;
  }
  window.location.assign(path);
}

async function ensureTravelSession(email = getStoredEmail()) {
  const current = getStoredAuthContext();
  if (current) return current;
  if (typeof window !== "undefined" && window.location.pathname !== "/") {
    navigateAfterLogin("/");
  }
  throw new Error(`Sign in required for ${email || DEFAULT_EMAIL}`);
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "INR" || currency === "JPY" ? 0 : 2
  }).format(amount || 0);
}

function parseNationalityCommand(prompt: string) {
  const match = prompt.match(/\b(?:nationality|citizenship|passport holder|passport)\s*(?:is|:|-)?\s*(indian|india|[a-z][a-z\s]{2,40})\b/i);
  if (!match) return "";
  const value = match[1].trim().replace(/[.,;:!?]+$/, "");
  if (/^india$/i.test(value)) return "Indian";
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const DATE_TOKEN_PATTERN = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+\d{4})`;
const DEPART_DATE_VOCABULARY = String.raw`(?:travel|trip|journey|depart(?:ure)?|outbound|start|leave|leaving|fly(?:ing)?\s*out|going|go)`;
const RETURN_DATE_VOCABULARY = String.raw`(?:return|coming\s*back|come\s*back|inbound|end|back|arrival\s*back)`;

function parseDatePhrase(value: string) {
  const clean = value.trim().replace(/\b(on|date)\b/gi, "").replace(/[,.;]+$/g, "").replace(/\s+/g, " ");
  const monthNames: Record<string, string> = {
    jan: "01", january: "01",
    feb: "02", february: "02",
    mar: "03", march: "03",
    apr: "04", april: "04",
    may: "05",
    jun: "06", june: "06",
    jul: "07", july: "07",
    aug: "08", august: "08",
    sep: "09", sept: "09", september: "09",
    oct: "10", october: "10",
    nov: "11", november: "11",
    dec: "12", december: "12"
  };

  function iso(year: string | number, month: string | number, day: string | number) {
    const numericYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
    if (date.getUTCFullYear() !== numericYear || date.getUTCMonth() !== numericMonth - 1 || date.getUTCDate() !== numericDay) return "";
    return `${numericYear}-${String(numericMonth).padStart(2, "0")}-${String(numericDay).padStart(2, "0")}`;
  }

  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return iso(isoMatch[1], isoMatch[2], isoMatch[3]);

  const slashMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    return iso(slashMatch[3], month, day);
  }

  const monthFirst = clean.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (monthFirst) return iso(monthFirst[3], monthNames[monthFirst[1].toLowerCase()], monthFirst[2]);

  const dayFirst = clean.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i);
  if (dayFirst) return iso(dayFirst[3], monthNames[dayFirst[2].toLowerCase()], dayFirst[1]);

  return "";
}

function parseDateCommand(prompt: string) {
  const datePattern = DATE_TOKEN_PATTERN;
  const dateConnector = String.raw`(?:(?:is|are|to|:|-|on)\s*){0,2}`;
  const departLabel = String.raw`${DEPART_DATE_VOCABULARY}\s*(?:date)?`;
  const returnLabel = String.raw`${RETURN_DATE_VOCABULARY}\s*(?:date)?`;
  const pairMatch = prompt.match(new RegExp(`\\b(?:dates?|travel dates?|${departLabel}\\s*(?:and|&)\\s*${returnLabel})\\b\\s*${dateConnector}(${datePattern})\\s*(?:to|through|until|-|and|&)\\s*(?:${returnLabel}\\s*)?${dateConnector}(${datePattern})`, "i"));
  const departMatch = prompt.match(new RegExp(`\\b${departLabel}\\s*${dateConnector}(${datePattern})`, "i"));
  const returnMatch = prompt.match(new RegExp(`\\b${returnLabel}\\s*${dateConnector}(${datePattern})`, "i"));
  const departDate = parseDatePhrase(departMatch?.[1] || pairMatch?.[1] || "");
  const returnDate = parseDatePhrase(returnMatch?.[1] || pairMatch?.[2] || "");
  if (!departDate && !returnDate) return null;
  if (departDate && returnDate && returnDate < departDate) {
    return { departDate, returnDate, error: "Return date must be on or after the depart date." };
  }
  return { departDate, returnDate, error: "" };
}

type EditableRequestTextField =
  | "travellerName"
  | "travellerEmail"
  | "company"
  | "origin"
  | "destination"
  | "purpose"
  | "preferences"
  | "specialRequests";

const EDITABLE_TEXT_FIELD_LABELS: Record<EditableRequestTextField, string> = {
  travellerName: "Traveller name",
  travellerEmail: "Traveller email",
  company: "Company",
  origin: "Origin",
  destination: "Destination",
  purpose: "Trip purpose",
  preferences: "Preferences",
  specialRequests: "Special requests"
};

function parseTextFieldCommand(prompt: string): { key: EditableRequestTextField; value: string } | null {
  const aliases: Array<[EditableRequestTextField, RegExp]> = [
    ["travellerName", /\b(?:travell?er\s*)?name\b/i],
    ["travellerEmail", /\b(?:travell?er\s*)?email\b/i],
    ["company", /\b(?:company|client company|organisation|organization)\b/i],
    ["origin", /\b(?:origin|from city|from airport|departure city|departure airport)\b/i],
    ["destination", /\b(?:destination|to city|to airport|arrival city|arrival airport)\b/i],
    ["purpose", /\b(?:purpose|trip purpose|reason)\b/i],
    ["preferences", /\b(?:preferences?|travel preferences?|seat preference|meal preference|hotel preference)\b/i],
    ["specialRequests", /\b(?:special requests?|requests?|accessibility notes?|transfer notes?)\b/i]
  ];
  for (const [key, alias] of aliases) {
    const updatePattern = new RegExp(`(?:update|set|change|correct|edit)\\s+(?:the\\s+)?${alias.source}\\s*(?:to|as|is|:|-)\\s+(.+)`, "i");
    const directPattern = new RegExp(`${alias.source}\\s*(?:is|:|-)\\s+(.+)`, "i");
    const match = prompt.match(updatePattern) || prompt.match(directPattern);
    if (!match) continue;
    const value = match[1].trim().replace(/^["']|["']$/g, "").replace(/[.;]+$/g, "");
    if (!value || value.length > 240) return null;
    if (key === "travellerEmail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
    return { key, value };
  }
  return null;
}

function removeMissingField(value: string, fieldPattern: RegExp) {
  return value
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !fieldPattern.test(line))
    .join("\n");
}

function isSafeUserError(message: string) {
  return message !== "Travel service request failed"
    && message.length <= 600
    && !/(token|secret|password|api[_ -]?key|stack trace)/i.test(message);
}

function formatDate(value: string) {
  if (!value) return "TBD";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function formatUpdated(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
}

function formatDateTimeText(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
}

function formatReviewDateTimeText(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

function formatClockText(value?: string | null) {
  const match = (value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return value || "";
  const parsed = new Date(`2000-01-01T${match[1].padStart(2, "0")}:${match[2]}:00`);
  if (Number.isNaN(parsed.getTime())) return value || "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(parsed);
}

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] || email;
  return localPart.replace(/[._-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isActiveRequest(request: CorporateTravelRequest) {
  return request.status !== "finalized";
}

function summaryFromRequests(requests: CorporateTravelRequest[]): CorporateAdminSummary {
  const activeRequests = requests.filter(isActiveRequest);
  const destinationCounts = requests.reduce<Record<string, number>>((counts, request) => {
    counts[request.destination] = (counts[request.destination] || 0) + 1;
    return counts;
  }, {});
  return {
    totalRequests: requests.length,
    newRequests: requests.filter((request) => request.status === "new").length,
    pendingApprovals: activeRequests.filter((request) => request.status === "processing" || request.approvalStatus === "Required").length,
    missingInfo: requests.filter((request) => request.status === "missing_info").length,
    visaIssues: activeRequests.filter((request) => request.visaStatus !== "clear").length,
    finalizedItineraries: requests.filter((request) => request.status === "finalized").length,
    averageHandlingTimeHours: 3.8,
    commonDestinations: Object.entries(destinationCounts)
      .map(([destination, count]) => ({ destination, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  };
}

function buildDashboardRequests(requests: CorporateTravelRequest[]) {
  return requests;
}

function compactTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(parsed);
}

function updatedAge(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Updated recently";
  const minutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (minutes < 60) return `Updated ${minutes || 1}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

function routeText(request: CorporateTravelRequest) {
  return `${request.origin || "Origin pending"} → ${request.destination || "Destination pending"}`;
}

function formatTicketDateRange(request: CorporateTravelRequest) {
  return `${formatDate(request.departDate)} - ${formatDate(request.returnDate)}`;
}

function corporateRequestTripContext(request: CorporateTravelRequest): Trip {
  return {
    id: request.id,
    owner_id: "travel-ops",
    owner_department: "travel_ops",
    request: {
      origin: request.origin,
      destination: request.destination,
      depart_date: request.departDate,
      return_date: request.returnDate,
      travelers: 1,
      cabin: "economy",
      budget_usd: null,
      purpose: request.purpose
    },
    status: "draft",
    risk: priorityFor(request).toLowerCase() === "high" ? "high" : "medium",
    flight_offers: request.recommendedPlans.map((plan) => ({
      id: `${plan.id}-flight`,
      kind: "flight",
      title: plan.flightSummary,
      provider: "corporate-plan",
      price_usd: plan.currency === "USD" ? plan.totalAmount : 0,
      currency: plan.currency,
      refundable: false,
      notes: [`Estimated total ${plan.totalAmount} ${plan.currency}`, plan.tradeoffs].filter(Boolean)
    })),
    hotel_offers: request.recommendedPlans.map((plan) => ({
      id: `${plan.id}-hotel`,
      kind: "hotel",
      title: plan.hotelSummary,
      provider: "corporate-plan",
      price_usd: plan.currency === "USD" ? plan.totalAmount : 0,
      currency: plan.currency,
      refundable: false,
      notes: [`Estimated total ${plan.totalAmount} ${plan.currency}`, plan.policyFit].filter(Boolean)
    })),
    itinerary: [],
    policy_checks: [request.budgetPolicyCheck, request.readinessCheck].filter(Boolean),
    savings_suggestions: request.recommendedPlans.map((plan) => plan.tradeoffs).filter(Boolean),
    created_at: request.lastUpdated
  };
}

function priorityFor(request: CorporateTravelRequest): "High" | "Medium" | "Low" {
  if (request.status === "finalized" || request.status === "cancelled") {
    return "Low";
  }
  if (request.criticalIssueStatus === "Urgent") {
    return "High";
  }
  if (
    request.status === "missing_info"
    || request.visaStatus === "blocked"
    || request.visaStatus === "pending"
    || request.approvalStatus === "Required"
  ) {
    return "High";
  }
  if (request.status === "new" || request.status === "planning") {
    return "Medium";
  }
  return "Low";
}

function priorityReasons(request: CorporateTravelRequest) {
  if (request.status === "finalized") return ["Completed"];
  if (request.status === "cancelled") return ["Cancelled"];
  const reasons: string[] = [];
  if (request.criticalIssueStatus === "Urgent") reasons.push("Critical issue");
  if (request.status === "missing_info" || request.missingInformation) reasons.push("Missing info");
  if (request.visaStatus === "blocked" || request.visaStatus === "pending") reasons.push("Visa issue");
  if (request.approvalStatus === "Required") reasons.push("Approval needed");
  return reasons.length ? reasons : ["Ready"];
}

function nextActionFor(request: CorporateTravelRequest) {
  if (request.status === "finalized") return "Completed";
  if (request.status === "cancelled") return "Cancelled";
  if (request.criticalIssueStatus === "Urgent") return "Work issue";
  if (request.status === "missing_info") return "Ask for info";
  if (request.status === "new") return "Generate plan";
  if (request.status === "processing") return "Await client approval";
  if (request.status === "planning") return "Review plan";
  if (request.status === "pending_approval" || request.approvalStatus === "Required") return "Track approval";
  if (!request.finalApproved) return "Finalize itinerary";
  if (request.missingInformation) return "Ask for info";
  return "Completed";
}

function boardStageFor(request: CorporateTravelRequest) {
  if (request.status === "finalized" || request.status === "cancelled") return "completed";
  if (request.criticalIssueStatus === "Urgent") return "new_entries";
  if (request.status === "missing_info") return "needs_details";
  if (request.status === "processing" || request.status === "planning" || request.status === "pending_approval") return "processing";
  return "new_entries";
}

function queueFilterFor(request: CorporateTravelRequest): QueueFilter {
  return boardStageFor(request) as QueueFilter;
}

function firstAvailableQueueFilter(requests: CorporateTravelRequest[], current: QueueFilter): QueueFilter {
  if (requests.some((request) => queueFilterFor(request) === current)) return current;
  return (["new_entries", "processing", "needs_details", "completed"] as QueueFilter[]).find((filter) => requests.some((request) => queueFilterFor(request) === filter)) || "new_entries";
}

function useSelectedRole() {
  const [role, setRole] = useState<CorporateRole>("agent");

  useEffect(() => {
    setRole(getStoredRole());
  }, []);

  return role;
}

function useTravelAuth() {
  const [auth, setAuth] = useState<AuthContext | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureTravelSession()
      .then((session) => {
        if (mounted) setAuth(session);
      })
      .catch(() => {
        if (mounted) setAuth(getStoredAuthContext());
      });
    return () => {
      mounted = false;
    };
  }, []);

  return auth;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("unipro-travel-theme");
    const next = stored === "dark" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("unipro-travel-theme", next);
  }

  return (
    <button className="icon-text-button" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

function UniproLogo() {
  return (
    <span className="brand-lockup">
      <img src="/unipro-logo.png" alt="Unipro" />
      <strong>Travel Operations</strong>
    </span>
  );
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.replace(/[_\s]+/g, "-").toLowerCase();
  return <span className={`status-pill ${normalized}`}>{value.replace(/_/g, " ")}</span>;
}

type AppArea = "dashboard" | "requests" | "itineraries" | "travelers" | "policy" | "audit" | "admin";

function AppShell({ active, children, notificationCount }: { active: AppArea; children: ReactNode; notificationCount?: number }) {
  const auth = useTravelAuth();
  const [storedEmail, setStoredEmail] = useState(DEFAULT_EMAIL);
  const displayEmail = auth?.email || storedEmail;
  const displayName = displayNameFromEmail(displayEmail);
  const canReadPolicy = Boolean(auth?.scopes.some((scope) => scope === "policy:read" || scope === "policy:write" || scope === "admin:summary"));
  const canReadAudit = Boolean(auth?.scopes.some((scope) => scope === "travel:plan" || scope === "admin:audit" || scope === "admin:summary"));
  const roleMeta = ROLE_ACCOUNTS.agent;
  const workspaceHome = "/dashboard";
  const workspaceTitle = "Agent Workspace";
  const workspaceContext = "Requests, forms, roster, policy flags";

  useEffect(() => {
    setStoredEmail(getStoredEmail());
  }, []);

  function signOut() {
    clearAuthSession();
    window.localStorage.removeItem(SELECTED_ROLE_KEY);
    window.localStorage.removeItem(USER_EMAIL_KEY);
    navigateAfterLogin("/");
  }

  return (
    <main className="ops-shell">
      <aside className="ops-sidebar" aria-label="Travel workspace sections">
        <Link className="sidebar-brand" href={workspaceHome} aria-label={workspaceTitle}><UniproLogo /></Link>
        <nav aria-label="Travel operations navigation">
          <Link className={active === "dashboard" || active === "requests" ? "active" : ""} href="/dashboard"><User size={18} /><span className="nav-label">Agent Operations</span></Link>
          <Link className={active === "itineraries" ? "active" : ""} href="/planner"><Plane size={18} /><span className="nav-label">Itineraries</span></Link>
          <Link className={active === "travelers" ? "active" : ""} href="/travelers"><IdCard size={18} /><span className="nav-label">Traveler Roster</span></Link>
          {canReadPolicy ? <Link className={active === "policy" ? "active" : ""} href="/policy"><ShieldCheck size={18} /><span className="nav-label">Policy Context</span></Link> : null}
          {canReadAudit ? <Link className={active === "audit" ? "active" : ""} href="/audit"><History size={18} /><span className="nav-label">Audit</span></Link> : null}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-label">Workspace</span>
          <button aria-label="Sign out" className="sign-out-button" type="button" onClick={signOut}>
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <section className="ops-main-shell">
        <header className="ops-topbar">
          <div className="topbar-context" aria-label="Current workspace">
            <span>{workspaceTitle}</span>
            <strong>{workspaceContext}</strong>
          </div>
          <div className="topbar-actions">
            <Link className="topbar-control notification-tab" href="/travelers#roster-review-queue" aria-label="Open workflow notifications">
              <Clock3 size={17} />
              <span>Notifications</span>
              {typeof notificationCount === "number" && notificationCount > 0 ? <strong>{notificationCount}</strong> : null}
            </Link>
            <ThemeToggle />
            <div className="topbar-profile">
              <div>
                <strong>{displayName}</strong>
                <span>{roleMeta.label}</span>
              </div>
            </div>
          </div>
        </header>
        <section className="ops-main">
          {children}
        </section>
      </section>
    </main>
  );
}

export function LoginScreen() {
  const [username, setUsername] = useState(ROLE_ACCOUNTS.agent.username);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [status, setStatus] = useState<"idle" | "signing-in" | "error">("idle");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (status === "signing-in") return;
    setStatus("signing-in");
    try {
      const session = await demoLogin(ROLE_ACCOUNTS.agent.email || DEFAULT_EMAIL, password, username.trim());
      storeAuthSession(session);
      window.localStorage.setItem(SELECTED_ROLE_KEY, "agent");
      navigateAfterLogin(ROLE_ACCOUNTS.agent.path);
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-panel-header">
          <UniproLogo />
        </div>
        <div className="login-title">
          <h1>AI-assisted corporate travel planning for travel agents.</h1>
          <div className="login-signal-grid">
            <Signal icon={CalendarDays} label="Planning only" value="Focus on the best itineraries, faster." />
            <Signal icon={ShieldCheck} label="Policy aware" value="Automatically checks policy & preferences." />
            <Signal icon={FileText} label="Form intake" value="Review requests, updates, and registrations." />
          </div>
          <p>Unipro Travel Operations helps agents manage corporate travel requests end-to-end with AI assistance, policy exception flags, traveler roster review, and itinerary handoff.</p>
        </div>
        <div className="login-illustration" aria-hidden="true">
          <img src="/login-airport-reference.png" alt="" />
        </div>
      </section>
      <form className="login-card" onSubmit={signIn}>
        <div className="login-card-title">
          <h2>Demo Access</h2>
          <p>Sign in to the travel agent workspace</p>
        </div>
        <label>
          <span>Username</span>
          <span className="input-with-icon login-credential-field"><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /><User size={18} /></span>
        </label>
        <label>
          <span>Password</span>
          <span className="input-with-icon login-credential-field"><input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /><Lock size={18} /></span>
        </label>
        {status === "error" ? <p className="inline-error">Sign in is unavailable. Please try again after a moment.</p> : null}
        <button className="primary-button" disabled={status === "signing-in"} type="submit">
          {status === "signing-in" ? <><RefreshCw className="spin-icon" size={19} /> Opening workspace...</> : <>Continue to workspace <ArrowRight size={19} /></>}
        </button>
      </form>
    </main>
  );
}

function Signal({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function TravelerDashboard() {
  const [requests, setRequests] = useState<CorporateTravelRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [workspaceRequestId, setWorkspaceRequestId] = useState("");
  const [workspaceInitialStep, setWorkspaceInitialStep] = useState<WorkspaceStep>("missing");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("new_entries");
  const [createStatus, setCreateStatus] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [formUploadFile, setFormUploadFile] = useState<File | null>(null);
  const [formUploadStatus, setFormUploadStatus] = useState("");
  const [uploadingForms, setUploadingForms] = useState(false);
  const [deletingRequestId, setDeletingRequestId] = useState("");
  const dashboardRequests = useMemo(() => buildDashboardRequests(requests), [requests]);
  const filteredDashboardRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return dashboardRequests.filter((request) => {
      const statusMatches = queueFilterFor(request) === queueFilter;
      const queryMatches = !query || [
        request.id,
        request.travellerName,
        request.travellerEmail,
        request.company,
        request.origin,
        request.destination,
        request.purpose
      ].some((value) => value.toLowerCase().includes(query));
      return statusMatches && queryMatches;
    });
  }, [dashboardRequests, searchQuery, queueFilter]);
  const selectedRequest = workspaceRequestId ? dashboardRequests.find((request) => request.id === workspaceRequestId) || null : null;

  async function refreshRequests() {
    setLoadState("loading");
    try {
      await ensureTravelSession();
      const items = await listCorporateRequests();
      if (items.length) {
        setRequests(items);
        setQueueFilter((current) => firstAvailableQueueFilter(items, current));
        setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0].id);
        setWorkspaceRequestId((current) => items.some((item) => item.id === current) ? current : "");
      } else {
        setRequests([]);
        setSelectedId("");
        setWorkspaceRequestId("");
      }
      setLoadState("ready");
      return items;
    } catch {
      setRequests([]);
      setSelectedId("");
      setWorkspaceRequestId("");
      setLoadState("error");
      return [];
    }
  }

  useEffect(() => {
    void refreshRequests();
  }, []);

  function replaceRequest(next: CorporateTravelRequest) {
    setRequests((current) => {
      const exists = current.some((request) => request.id === next.id);
      return exists ? current.map((request) => request.id === next.id ? next : request) : [next, ...current];
    });
    setQueueFilter(queueFilterFor(next));
    setSelectedId(next.id);
    setWorkspaceRequestId(next.id);
  }

  async function markCriticalIssue(id: string, issue: string, status: CorporateTravelRequest["criticalIssueStatus"] = "Urgent") {
    const saved = await updateCorporateCriticalIssue(id, issue || null, status);
    replaceRequest(saved);
    if (saved.criticalIssueStatus === "Urgent") {
      openWorkspace(saved.id, "flights");
    }
  }

  async function createRequest(payload: CorporateCreateRequest) {
    setCreatingRequest(true);
    setCreateStatus("");
    try {
      const created = await createCorporateRequest(payload);
      replaceRequest(created);
      setShowRequestForm(false);
    } catch (error) {
      const message = error instanceof Error && isSafeUserError(error.message)
        ? error.message
        : "Request could not be created. Check the details and try again.";
      setCreateStatus(message);
    } finally {
      setCreatingRequest(false);
    }
  }

  async function uploadTravelForms() {
    if (!formUploadFile || uploadingForms) return;
    setUploadingForms(true);
    setFormUploadStatus("");
    try {
      const result = await uploadCorporateRequests(formUploadFile);
      const refreshed = await refreshRequests();
      const importedId = result.requests[0]?.id || "";
      if (importedId && refreshed.some((request) => request.id === importedId)) {
        setSelectedId(importedId);
        setWorkspaceRequestId(importedId);
        setWorkspaceInitialStep("missing");
      } else {
        setWorkspaceRequestId("");
      }
      setShowRequestForm(false);
      setFormUploadFile(null);
      const created = result.createdRequests || result.requests.length;
      setFormUploadStatus(`${created} request${created === 1 ? "" : "s"} entered intake from ${formUploadFile.name}.`);
    } catch (error) {
      const message = error instanceof Error && isSafeUserError(error.message)
        ? error.message
        : "Travel forms could not be uploaded. Check the workbook, PDF, or Word form and try again.";
      setFormUploadStatus(message);
    } finally {
      setUploadingForms(false);
    }
  }

  async function deleteRequest(id: string) {
    const target = requests.find((request) => request.id === id);
    const confirmed = typeof window === "undefined" || window.confirm(`Delete request for ${target?.travellerName || id}? This cannot be undone.`);
    if (!confirmed || deletingRequestId) return;
    setDeletingRequestId(id);
    setFormUploadStatus("");
    try {
      await deleteCorporateRequest(id);
      setRequests((current) => current.filter((request) => request.id !== id));
      setSelectedId((current) => current === id ? "" : current);
      setWorkspaceRequestId((current) => current === id ? "" : current);
      setFormUploadStatus("Request deleted.");
    } catch {
      setFormUploadStatus("Request could not be deleted. Please try again.");
    } finally {
      setDeletingRequestId("");
    }
  }

  function openWorkspace(id: string, initialStep: WorkspaceStep = "missing") {
    setSelectedId(id);
    setWorkspaceRequestId(id);
    setWorkspaceInitialStep(initialStep);
    setShowRequestForm(false);
    setCreateStatus("");
  }

  function closeWorkspace() {
    setWorkspaceRequestId("");
    setWorkspaceInitialStep("missing");
    setShowRequestForm(false);
    setCreateStatus("");
  }

  const activeDashboardRequests = dashboardRequests.filter(isActiveRequest);
  const stats = {
    active: activeDashboardRequests.length,
    approval: activeDashboardRequests.filter((request) => request.approvalStatus === "Required").length,
    visa: activeDashboardRequests.filter((request) => request.visaStatus !== "clear").length
  };
  const headingTitle = showRequestForm ? "New Request" : selectedRequest ? selectedRequest.travellerName : "Travel Operations";
  const headingDescription = loadState === "loading"
    ? "Loading travel requests..."
    : showRequestForm
      ? "Capture one customer travel request for agent planning."
      : selectedRequest
        ? `${routeText(selectedRequest)} · ${formatTicketDateRange(selectedRequest)}`
        : "Manage ongoing travel requests and operational blocks.";

  return (
    <AppShell active="dashboard">
      <section className="page-heading">
        <div>
          <h1>{headingTitle}</h1>
          <p>{headingDescription}</p>
        </div>
        <div className="heading-actions">
          {showRequestForm || selectedRequest ? (
            <button className="secondary-button" type="button" onClick={closeWorkspace}>
              <ArrowRight className="back-icon" size={16} /> Back to Requests
            </button>
          ) : null}
          {selectedRequest ? (
            <button className="secondary-button danger-button" type="button" disabled={deletingRequestId === selectedRequest.id} onClick={() => void deleteRequest(selectedRequest.id)}>
              <Trash2 size={16} /> {deletingRequestId === selectedRequest.id ? "Deleting..." : "Delete Request"}
            </button>
          ) : null}
          {!showRequestForm ? (
            <>
              <label className="secondary-button heading-file-upload">
                <Upload size={16} />
                <span>{formUploadFile ? formUploadFile.name : "Upload Forms"}</span>
                <input
                  aria-label="Upload travel forms"
                  type="file"
                  accept=".xlsx,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    setFormUploadStatus("");
                    setFormUploadFile(event.target.files?.[0] || null);
                  }}
                />
              </label>
              <button className="secondary-button" type="button" disabled={!formUploadFile || uploadingForms} onClick={() => void uploadTravelForms()}>
                {uploadingForms ? "Importing..." : "Import Forms"}
              </button>
              <button className="primary-button" type="button" onClick={() => {
                setCreateStatus("");
                setFormUploadStatus("");
                setShowRequestForm(true);
              }}>
                <Plus size={16} /> New Request
              </button>
            </>
          ) : null}
        </div>
      </section>
      {formUploadStatus ? <p className="form-status" role="status">{formUploadStatus}</p> : null}

      {showRequestForm ? (
        <section className="request-form-page">
          <TravelRequestForm
            errorMessage={createStatus}
            onCancel={closeWorkspace}
            onCreate={(payload) => void createRequest(payload)}
            submitting={creatingRequest}
          />
        </section>
      ) : selectedRequest ? (
        <section className="request-workspace-layout">
          <section className="selected-request-column">
            <RequestDetail request={selectedRequest} onChange={replaceRequest} initialStep={workspaceInitialStep} />
          </section>
        </section>
      ) : (
        <section className="requests-page">
          <section className="dashboard-metric-grid" aria-label="Request metrics">
            <article className="dashboard-metric-card">
              <span>Active Requests</span>
              <strong>{stats.active}</strong>
            </article>
            <article className="dashboard-metric-card">
              <span>Approval Flags</span>
              <strong>{stats.approval}</strong>
            </article>
            <article className="dashboard-metric-card">
              <span>Visa Issues</span>
              <strong>{stats.visa}</strong>
            </article>
          </section>
          <RequestQueue
            allRequests={dashboardRequests}
            requests={filteredDashboardRequests}
            selectedId=""
            searchQuery={searchQuery}
            queueFilter={queueFilter}
            onOpen={openWorkspace}
            onCriticalIssue={(id, issue, status) => void markCriticalIssue(id, issue, status)}
            onDelete={(id) => void deleteRequest(id)}
            deletingId={deletingRequestId}
            onRefresh={() => void refreshRequests()}
            onSearchChange={setSearchQuery}
            onQueueFilterChange={setQueueFilter}
          />
          {loadState === "error" ? <section className="empty-panel">Requests are unavailable.</section> : null}
        </section>
      )}
    </AppShell>
  );
}

function RequestQueue({
  allRequests,
  requests,
  selectedId,
  searchQuery,
  queueFilter,
  onOpen,
  onCriticalIssue,
  onDelete,
  deletingId,
  onRefresh,
  onSearchChange,
  onQueueFilterChange
}: {
  allRequests: CorporateTravelRequest[];
  requests: CorporateTravelRequest[];
  selectedId: string;
  searchQuery: string;
  queueFilter: QueueFilter;
  onOpen: (id: string, initialStep?: WorkspaceStep) => void;
  onCriticalIssue: (id: string, issue: string, status?: CorporateTravelRequest["criticalIssueStatus"]) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  deletingId: string;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onQueueFilterChange: (value: QueueFilter) => void;
}) {
  const [issueStatus, setIssueStatus] = useState("");
  const [workingIssueId, setWorkingIssueId] = useState("");
  const filters: Array<{ value: QueueFilter; label: string }> = [
    { value: "new_entries", label: "New Entries" },
    { value: "needs_details", label: "Pending Details" },
    { value: "processing", label: "Processing" },
    { value: "completed", label: "Completed" }
  ];
  const counts = filters.reduce<Record<QueueFilter, number>>((current, filter) => {
    current[filter.value] = allRequests.filter((request) => queueFilterFor(request) === filter.value).length;
    return current;
  }, {
    new_entries: 0,
    needs_details: 0,
    processing: 0,
    completed: 0
  });
  async function markIssue(request: CorporateTravelRequest, issue: string) {
    if (!issue || workingIssueId) return;
    setIssueStatus("");
    setWorkingIssueId(request.id);
    try {
      await onCriticalIssue(request.id, issue, "Urgent");
    } catch {
      setIssueStatus("Critical issue could not be saved. Please try again.");
    } finally {
      setWorkingIssueId("");
    }
  }

  async function clearIssue(request: CorporateTravelRequest) {
    if (workingIssueId) return;
    setIssueStatus("");
    setWorkingIssueId(request.id);
    try {
      await onCriticalIssue(request.id, "", "None");
    } catch {
      setIssueStatus("Critical issue could not be cleared. Please try again.");
    } finally {
      setWorkingIssueId("");
    }
  }

  return (
    <section className="ops-card queue-card" aria-label="Requests">
      <div className="card-title-row">
        <h2>Requests</h2>
        <div className="queue-tools">
          <label className="queue-search">
            <Search size={15} />
            <input
              aria-label="Search requests"
              placeholder="Search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
          <button aria-label="Refresh requests" className="icon-button" type="button" onClick={onRefresh}><RefreshCw size={16} /></button>
        </div>
      </div>
      <div className="queue-tabs" aria-label="Request status tabs">
        {filters.map((filter) => (
          <button className={queueFilter === filter.value ? "active" : ""} key={filter.value} type="button" onClick={() => onQueueFilterChange(filter.value)}>
            {filter.label} <span>{counts[filter.value]}</span>
          </button>
        ))}
      </div>
      <div aria-label="Scrollable request table" className="ticket-table-wrap" tabIndex={0}>
        <table className="ticket-table">
          <thead>
            <tr>
              <th scope="col">Traveler</th>
              <th scope="col">Route</th>
              <th scope="col">Dates</th>
              <th scope="col">Status</th>
              <th scope="col">Critical Issue</th>
              <th scope="col" className="ticket-actions-heading">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length ? requests.map((request) => (
              <tr className={selectedId === request.id ? "selected" : ""} key={request.id}>
                <td>
                  <div className="ticket-identity">
                    <strong>{request.travellerName}</strong>
                    <span className="ticket-meta-line">
                      <span className="request-card-id">{request.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{request.company}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="ticket-route-cell">
                    <span>{request.origin || "Origin pending"}</span>
                    <ArrowRight size={14} />
                    <span>{request.destination || "Destination pending"}</span>
                  </div>
                </td>
                <td className="ticket-date-cell">{formatTicketDateRange(request)}</td>
                <td>
                  <span className="reason-chip-row">
                    <StatusPill value={priorityFor(request)} />
                    {priorityReasons(request).slice(0, 2).map((reason) => <span key={reason}>{reason}</span>)}
                  </span>
                </td>
                <td>
                  <div className="critical-issue-cell">
                    {request.criticalIssueStatus === "Urgent" ? (
                      <>
                        <StatusPill value="Urgent" />
                        <span>{request.criticalIssue || "Urgent travel disruption"}</span>
                        <button className="link-button" type="button" onClick={() => void clearIssue(request)} disabled={workingIssueId === request.id}>
                          Clear
                        </button>
                      </>
                    ) : (
                      <span>No active issue</span>
                    )}
                    <select
                      aria-label={`Critical issue for ${request.id}`}
                      disabled={workingIssueId === request.id}
                      value=""
                      onChange={(event) => void markIssue(request, event.target.value)}
                    >
                      <option value="">Mark issue</option>
                      <option value="Flight cancelled - book an alternative from the same origin and adjust hotel dates if needed.">Flight cancelled</option>
                      <option value="Booked ticket cancellation - recover ticket value and replace the itinerary.">Ticket cancellation</option>
                      <option value="Itinerary change - rework flights and hotel nights around the updated schedule.">Change itinerary</option>
                      <option value="Traveler emergency - protect traveler continuity and rebuild the trip around the urgent constraint.">Traveler emergency</option>
                    </select>
                  </div>
                </td>
                <td className="ticket-action-cell">
                  <div className="ticket-action-stack">
                    {request.criticalIssueStatus === "Urgent" ? (
                      <button
                        aria-label={`${request.id} Work critical issue`}
                        className="ticket-action-button urgent"
                        type="button"
                        onClick={() => onOpen(request.id, "flights")}
                      >
                        Work Issue
                      </button>
                    ) : null}
                    <button
                      aria-label={`${request.id} Next: ${nextActionFor(request)}`}
                      className="ticket-action-button"
                      type="button"
                      onClick={() => onOpen(request.id)}
                    >
                      Next: {nextActionFor(request)}
                    </button>
                    <button
                      aria-label={`Delete request for ${request.travellerName || request.id}`}
                      className="ticket-action-button delete"
                      type="button"
                      disabled={deletingId === request.id}
                      onClick={() => onDelete(request.id)}
                    >
                      <Trash2 size={14} /> {deletingId === request.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty-panel">No matching requests.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="queue-footer">
        <span>Showing {requests.length ? 1 : 0} to {requests.length} of {requests.length} requests</span>
        {issueStatus ? <span role="status">{issueStatus}</span> : null}
      </div>
    </section>
  );
}

function TravelRequestForm({
  errorMessage = "",
  onCancel,
  onCreate,
  submitting = false,
  title = "Travel Request Form",
  submitLabel = "Create Request",
  initialValues
}: {
  errorMessage?: string;
  onCancel?: () => void;
  onCreate: (payload: CorporateCreateRequest) => void | Promise<void>;
  submitting?: boolean;
  title?: string;
  submitLabel?: string;
  initialValues?: CorporateCreateRequest;
}) {
  const [form, setForm] = useState<CorporateCreateRequest>({
    ...EMPTY_FORM,
    ...initialValues
  });
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadingClientForm, setDownloadingClientForm] = useState(false);
  const formStatus = errorMessage || downloadStatus;

  function update<K extends keyof CorporateCreateRequest>(key: K, value: CorporateCreateRequest[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleOption(key: "preferences" | "specialRequests", value: string) {
    setForm((current) => {
      const parts = current[key].split(";").map((part) => part.trim()).filter(Boolean);
      const exists = parts.includes(value);
      const next = exists ? parts.filter((part) => part !== value) : [...parts, value];
      return { ...current, [key]: next.join("; ") };
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setDownloadStatus("");
    void Promise.resolve(onCreate(form)).catch(() => {
      // Parent screens own the visible error message.
    });
  }

  async function downloadClientForm() {
    setDownloadStatus("");
    setDownloadingClientForm(true);
    try {
      const blob = await downloadClientRequestFormDocx();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "client_travel_request_form.docx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadStatus("Client Word form could not be downloaded. Please try again.");
    } finally {
      setDownloadingClientForm(false);
    }
  }

  return (
    <form className="ops-card request-form" onSubmit={submit}>
      <div className="card-title-row">
        <h2>{title}</h2>
        <div className="button-row compact">
          <button className="secondary-button" type="button" onClick={() => void downloadClientForm()} disabled={downloadingClientForm}>
            <FileText size={16} /> {downloadingClientForm ? "Preparing Word..." : "Client Form Word"}
          </button>
        </div>
      </div>
      <div className="form-grid">
        <label><span>Traveller name</span><input value={form.travellerName} onChange={(event) => update("travellerName", event.target.value)} required /></label>
        <label><span>Employee band</span><input value={form.employeeBand} onChange={(event) => update("employeeBand", event.target.value)} placeholder="1, 2, or 3" required /></label>
        <label><span>Origin</span><input value={form.origin} onChange={(event) => update("origin", event.target.value)} required /></label>
        <label><span>Destination</span><input value={form.destination} onChange={(event) => update("destination", event.target.value)} required /></label>
        <label><span>Depart date</span><input type="date" value={form.departDate} onChange={(event) => update("departDate", event.target.value)} required /></label>
        <label><span>Return date</span><input type="date" value={form.returnDate} onChange={(event) => update("returnDate", event.target.value)} required /></label>
        <fieldset className="span-2 option-field">
          <legend>Preferences</legend>
          <div className="option-chip-grid">
            {PREFERENCE_OPTIONS.map((option) => (
              <button
                aria-pressed={form.preferences.split(";").map((part) => part.trim()).includes(option)}
                className={form.preferences.split(";").map((part) => part.trim()).includes(option) ? "option-chip selected" : "option-chip"}
                key={option}
                type="button"
                onClick={() => toggleOption("preferences", option)}
              >
                {option}
              </button>
            ))}
          </div>
          <label><span>Other preference details</span><textarea value={form.preferences} onChange={(event) => update("preferences", event.target.value)} /></label>
        </fieldset>
        <fieldset className="span-2 option-field">
          <legend>Special requests</legend>
          <div className="option-chip-grid">
            {SPECIAL_REQUEST_OPTIONS.map((option) => (
              <button
                aria-pressed={form.specialRequests.split(";").map((part) => part.trim()).includes(option)}
                className={form.specialRequests.split(";").map((part) => part.trim()).includes(option) ? "option-chip selected" : "option-chip"}
                key={option}
                type="button"
                onClick={() => toggleOption("specialRequests", option)}
              >
                {option}
              </button>
            ))}
          </div>
          <label><span>Other special request details</span><textarea value={form.specialRequests} onChange={(event) => update("specialRequests", event.target.value)} /></label>
        </fieldset>
      </div>
      {formStatus ? <p className="form-status" role="status">{formStatus}</p> : null}
      <div className="button-row">
        {onCancel ? <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button> : null}
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? <RefreshCw className="spin-icon" size={16} /> : <ClipboardCheck size={16} />} {submitting ? "Creating..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

type WorkspaceStep = "missing" | "flights" | "hotel" | "transfer" | "itinerary" | "client_review" | "approval";

const WORKSPACE_STEPS: Array<{ id: WorkspaceStep; label: string }> = [
  { id: "missing", label: "Missing Info" },
  { id: "flights", label: "Flights" },
  { id: "hotel", label: "Hotel" },
  { id: "transfer", label: "Transfer" },
  { id: "itinerary", label: "Itinerary" },
  { id: "client_review", label: "Client Review" },
  { id: "approval", label: "Approval & Export" },
];

function normalBuilderStep(step: WorkspaceStep | "intake" | "readiness" | "plan" | "chat" | "finalize"): WorkspaceStep {
  if (step === "intake" || step === "readiness") return "missing";
  if (step === "plan" || step === "chat") return "flights";
  if (step === "finalize") return "approval";
  return step;
}

function RequestDetail({ request, onChange, initialStep = "missing" }: { request: CorporateTravelRequest; onChange: (request: CorporateTravelRequest) => void; initialStep?: WorkspaceStep }) {
  const [draft, setDraft] = useState(request);
  const [activeStep, setActiveStep] = useState<WorkspaceStep>(normalBuilderStep(request.criticalIssueStatus === "Urgent" ? "flights" : initialStep));
  const [statusMessage, setStatusMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [commandInput, setCommandInput] = useState("");
  const [guideMessage, setGuideMessage] = useState("");
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperMessage, setHelperMessage] = useState("");
  const [helperSuggestion, setHelperSuggestion] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<"idle" | "responding">("idle");
  const selectedPlan = draft.recommendedPlans.find((plan) => plan.selected) || draft.recommendedPlans[0];
  const selectedFlightOffer = draft.flightOffers.find((offer) => offer.id === (draft.selectedFlightOfferId || selectedPlan?.flightOfferId))
    || draft.flightOffers.find((offer) => offer.selected)
    || draft.flightOffers[0];
  const selectedHotelOffer = draft.hotelOffers.find((offer) => offer.id === draft.selectedHotelOfferId)
    || draft.hotelOffers.find((offer) => offer.selected)
    || draft.hotelOffers[0];
  const selectedGroundTransferOffer = draft.groundTransferOffers.find((offer) => offer.id === (draft.selectedGroundTransferOfferId || selectedPlan?.groundTransferOfferId))
    || draft.groundTransferOffers.find((offer) => offer.selected)
    || draft.groundTransferOffers[0];
  const recoveryMode = draft.criticalIssueStatus === "Urgent";
  const agentNotes = draft.agentNotes || [];
  const travelerProfileWarning = agentNotes.find((note) => /register or update their profile/i.test(note));

  useEffect(() => {
    setDraft(request);
  }, [request]);

  useEffect(() => {
    setStatusMessage("");
    setGuideMessage("");
    setHelperOpen(false);
    setHelperMessage("");
    setHelperSuggestion("");
    setActiveStep(normalBuilderStep(request.criticalIssueStatus === "Urgent" ? "flights" : initialStep));
  }, [request.id, initialStep]);

  function updateDraft<K extends keyof CorporateTravelRequest>(key: K, value: CorporateTravelRequest[K]) {
    setDraft((current) => ({ ...current, [key]: value, lastUpdated: new Date().toISOString() }));
  }

  function corporateUpdatePayloadFromDraft(source: CorporateTravelRequest): CorporateRequestUpdate {
    return {
      travellerName: source.travellerName,
      travellerEmail: source.travellerEmail,
      aiSummary: source.aiSummary,
      readinessCheck: source.readinessCheck,
      company: source.company,
      origin: source.origin,
      destination: source.destination,
      departDate: source.departDate,
      returnDate: source.returnDate,
      purpose: source.purpose,
      preferences: source.preferences,
      specialRequests: source.specialRequests,
      budgetPolicyCheck: source.budgetPolicyCheck,
      recommendedPlans: source.recommendedPlans,
      flightOffers: source.flightOffers,
      selectedFlightOfferId: source.selectedFlightOfferId,
      hotelOffers: source.hotelOffers,
      selectedHotelOfferId: source.selectedHotelOfferId,
      groundTransferOffers: source.groundTransferOffers,
      selectedGroundTransferOfferId: source.selectedGroundTransferOfferId,
      missingInformation: source.missingInformation,
      travellerNationality: source.travellerNationality,
      customerMessageDraft: source.customerMessageDraft,
      finalItineraryDraft: source.finalItineraryDraft,
      status: source.status,
      approvalStatus: source.approvalStatus,
      finalApproved: source.finalApproved
    };
  }

  function selectFlightOffer(id: string) {
    setDraft((current) => ({
      ...current,
      selectedFlightOfferId: id,
      flightOffers: current.flightOffers.map((offer) => ({ ...offer, selected: offer.id === id })),
      recommendedPlans: current.recommendedPlans.some((plan) => plan.flightOfferId === id)
        ? current.recommendedPlans.map((plan) => ({ ...plan, selected: plan.flightOfferId === id }))
        : current.recommendedPlans,
      finalApproved: false,
      status: "planning"
    }));
  }

  function selectHotelOffer(id: string) {
    setDraft((current) => ({
      ...current,
      selectedHotelOfferId: id,
      hotelOffers: current.hotelOffers.map((offer) => ({ ...offer, selected: offer.id === id })),
      finalApproved: false,
      status: "planning"
    }));
  }

  function selectGroundTransferOffer(id: string) {
    setDraft((current) => ({
      ...current,
      selectedGroundTransferOfferId: id,
      groundTransferOffers: current.groundTransferOffers.map((offer) => ({ ...offer, selected: offer.id === id })),
      recommendedPlans: current.recommendedPlans.some((plan) => plan.groundTransferOfferId === id)
        ? current.recommendedPlans.map((plan) => ({ ...plan, selected: plan.groundTransferOfferId === id }))
        : current.recommendedPlans,
      finalApproved: false,
      status: "planning"
    }));
  }

  async function generatePlan() {
    setWorking(true);
    try {
      const generated = await generateCorporateTravelPlan(draft.id);
      setDraft(generated);
      onChange(generated);
      setStatusMessage("Plan generated for agent review.");
    } catch {
      setStatusMessage("Travel plan generation is unavailable. Please retry after the service is back.");
    } finally {
      setWorking(false);
    }
  }

  async function runAutomatedPipeline() {
    setWorking(true);
    try {
      const processed = await runCorporateRequestPipeline(draft.id);
      setDraft(processed);
      onChange(processed);
      setStatusMessage(processed.status === "missing_info" ? "Moved to Pending Details." : "Automated pipeline started and client options were prepared.");
    } catch {
      setStatusMessage("Automated pipeline is unavailable. Manual planning is still available.");
    } finally {
      setWorking(false);
    }
  }

  async function saveEdits() {
    try {
      const saved = await updateCorporateRequest(draft.id, corporateUpdatePayloadFromDraft(draft));
      setDraft(saved);
      onChange(saved);
      setStatusMessage("Edits saved.");
    } catch {
      onChange(draft);
      setStatusMessage("Saved locally. Backend update is unavailable.");
    }
  }

  async function sendApproval() {
    const recipientEmail = draft.requesterEmail || draft.travellerEmail;
    if (!recipientEmail) {
      setStatusMessage("Approval email needs a sender or traveller email on the request.");
      return;
    }
    try {
      const result = await sendCorporateRequestNotification(draft.id, {
        kind: "approval_request",
        to: [recipientEmail],
        note: draft.customerMessageDraft || draft.aiSummary,
        attach_itinerary: false
      });
      setStatusMessage(result.safe_message || "Approval request sent.");
    } catch {
      setStatusMessage("Approval email could not be sent. Continue with manual follow-up.");
    }
  }

  async function approveFinal() {
    const approved = { ...draft, finalApproved: true, status: "finalized" as const, approvalStatus: draft.approvalStatus || "Received", lastUpdated: new Date().toISOString() };
    setDraft(approved);
    try {
      await updateCorporateRequest(draft.id, corporateUpdatePayloadFromDraft(approved));
      const finalized = await finalizeCorporateRequest(draft.id, {
        agent_reviewed: true,
        approval_status: approved.approvalStatus,
        finalApproved: true
      });
      setDraft(finalized);
      onChange(finalized);
      setStatusMessage("Final itinerary generated after agent review.");
    } catch {
      onChange(approved);
      setStatusMessage("Final itinerary marked locally. Backend finalization is unavailable.");
    }
  }

  async function downloadRequestPdf() {
    try {
      const blob = await downloadCorporateRequestPdf(draft.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.id}-final-itinerary.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatusMessage("Final itinerary is not ready. Complete approval and finalization before export.");
    }
  }

  async function persistGuideDraft(nextDraft: CorporateTravelRequest, savedStatusMessage: string) {
    setDraft(nextDraft);
    onChange(nextDraft);
    setAssistantStatus("responding");
    setStatusMessage("Saving guide update...");
    try {
      const saved = await updateCorporateRequest(nextDraft.id, corporateUpdatePayloadFromDraft(nextDraft));
      setDraft(saved);
      onChange(saved);
      setStatusMessage(savedStatusMessage);
      return true;
    } catch {
      setStatusMessage("Updated locally, but backend save is unavailable. Please retry Update Step.");
      return false;
    } finally {
      setAssistantStatus("idle");
    }
  }

  async function submitBuilderCommand(promptOverride?: string) {
    const prompt = (promptOverride || commandInput).trim();
    if (!prompt || assistantStatus === "responding") return;
    const localUpdate = buildNationalityGuideUpdate(prompt)
      || buildDateGuideUpdate(prompt)
      || buildTextFieldGuideUpdate(prompt);
    if (localUpdate) {
      setGuideMessage(localUpdate.guideMessage);
      setCommandInput("");
      if ("persist" in localUpdate && localUpdate.persist === false) {
        setStatusMessage(localUpdate.statusMessage);
        return;
      }
      await persistGuideDraft(localUpdate.nextDraft, localUpdate.statusMessage);
      return;
    }
    setAssistantStatus("responding");
    setStatusMessage("");
    try {
      const response = await chatWithAssistant({
        message: prompt,
        history: guideMessage ? [{ role: "assistant", content: guideMessage }] : [],
        trip: corporateRequestTripContext(draft),
        budget_context: draft.recommendedPlans.map((plan) => ({
          plan_id: plan.id,
          name: plan.name,
          estimated_total: plan.totalAmount,
          currency: plan.currency,
          tradeoffs: plan.tradeoffs
        })),
        source_context: {
          request_id: draft.id,
          active_step: activeStep,
          uploaded_form_summary: draft.originalRequest,
          recovery_mode: recoveryMode,
          critical_issue: recoveryMode ? {
            status: draft.criticalIssueStatus,
            issue: draft.criticalIssue || "Urgent travel disruption",
            recovery_goal: "Protect traveler continuity, find alternative flight from the same origin, and adjust hotels if dates or nights change."
          } : null,
          route_constraints: {
            origin: draft.origin,
            destination: draft.destination,
            depart_date: draft.departDate,
            return_date: draft.returnDate
          },
          selected_flight: selectedFlightOffer ? {
            airline: selectedFlightOffer.airline,
            outbound: selectedFlightOffer.outbound,
            return_leg: selectedFlightOffer.returnLeg,
            total_amount: selectedFlightOffer.totalAmount,
            currency: selectedFlightOffer.currency,
            source: selectedFlightOffer.source
          } : null,
          selected_hotel: selectedHotelOffer ? {
            name: selectedHotelOffer.name,
            address: selectedHotelOffer.address,
            total_amount: selectedHotelOffer.totalAmount,
            currency: selectedHotelOffer.currency,
            provider: selectedHotelOffer.provider
          } : null
        }
      });
      setGuideMessage(response.message);
      setCommandInput("");
    } catch {
      setGuideMessage(applyStepCommandHint(prompt) || "The guide is unavailable. Continue with the visible cards and fields, then save the request.");
    } finally {
      setAssistantStatus("idle");
    }
  }

  function buildNationalityGuideUpdate(prompt: string) {
    const nationality = parseNationalityCommand(prompt);
    if (!nationality) return null;
    const nextDraft = {
      ...draft,
      travellerNationality: nationality,
      missingInformation: removeMissingField(draft.missingInformation, /travell?er_details\.nationality|nationality|citizenship/i),
      finalApproved: false,
      lastUpdated: new Date().toISOString()
    };
    return {
      nextDraft,
      guideMessage: `Traveller nationality updated to ${nationality}. It has been removed from Missing Information and saved to the request.`,
      statusMessage: "Traveller nationality updated and saved."
    };
  }

  function buildDateGuideUpdate(prompt: string) {
    const command = parseDateCommand(prompt);
    if (!command) return null;
    if (command.error) {
      return {
        nextDraft: draft,
        guideMessage: command.error,
        statusMessage: command.error,
        persist: false
      };
    }
    const departDate = command.departDate || draft.departDate;
    const returnDate = command.returnDate || draft.returnDate;
    const nights = departDate && returnDate ? Math.max(1, Math.round((new Date(`${returnDate}T12:00:00`).getTime() - new Date(`${departDate}T12:00:00`).getTime()) / 86400000)) : undefined;
    const nextDraft = {
      ...draft,
      departDate,
      returnDate,
      missingInformation: removeMissingField(
        removeMissingField(draft.missingInformation, /travel_details\.depart_date|depart(?:ure)? date/i),
        /travel_details\.return_date|return date/i
      ),
      hotelOffers: draft.hotelOffers.map((offer) => ({
        ...offer,
        checkIn: departDate || offer.checkIn,
        checkOut: returnDate || offer.checkOut,
        nights: nights || offer.nights
      })),
      finalApproved: false,
      status: draft.status === "finalized" ? "planning" as const : draft.status,
      lastUpdated: new Date().toISOString()
    };
    const pieces = [
      command.departDate ? `depart date ${formatDate(command.departDate)}` : "",
      command.returnDate ? `return date ${formatDate(command.returnDate)}` : ""
    ].filter(Boolean).join(" and ");
    return {
      nextDraft,
      guideMessage: `Updated ${pieces} and saved to the request. Existing flight options may need Refresh Options before final export.`,
      statusMessage: "Travel dates updated and saved."
    };
  }

  function buildTextFieldGuideUpdate(prompt: string) {
    const command = parseTextFieldCommand(prompt);
    if (!command) return null;
    const nextDraft = {
      ...draft,
      [command.key]: command.value,
      missingInformation: removeMissingField(draft.missingInformation, new RegExp(command.key.replace(/[A-Z]/g, (letter) => `[_ ]?${letter.toLowerCase()}`), "i")),
      finalApproved: false,
      status: draft.status === "finalized" ? "planning" as const : draft.status,
      lastUpdated: new Date().toISOString()
    };
    return {
      nextDraft,
      guideMessage: `${EDITABLE_TEXT_FIELD_LABELS[command.key]} updated to ${command.value} and saved to the request.`,
      statusMessage: `${EDITABLE_TEXT_FIELD_LABELS[command.key]} updated and saved.`
    };
  }

  function applyStepCommandHint(prompt: string) {
    const text = prompt.toLowerCase();
    if (activeStep === "flights" && draft.flightOffers.length > 1 && (text.includes("fast") || text.includes("arrive") || text.includes("before") || text.includes("avoid"))) {
      const preferred = draft.flightOffers.find((offer) => /fast|direct|1 stop|arrival|recovery/i.test(`${offer.summary} ${offer.notes.join(" ")}`)) || draft.flightOffers[0];
      selectFlightOffer(preferred.id);
    }
    if (activeStep === "hotel" && draft.hotelOffers.length > 1 && (text.includes("office") || text.includes("client") || text.includes("near"))) {
      const preferred = draft.hotelOffers.find((offer) => /office|business|city|center|centre/i.test(`${offer.name} ${offer.summary} ${offer.address || ""}`)) || draft.hotelOffers[0];
      selectHotelOffer(preferred.id);
    }
    if (activeStep === "missing") {
      updateDraft("missingInformation", [draft.missingInformation, `Agent note: ${prompt}`].filter(Boolean).join("\n"));
    }
    return "";
  }

  function explainCurrentStep() {
    setHelperMessage(helperExplanation(activeStep, draft, selectedFlightOffer, selectedHotelOffer));
    setHelperSuggestion(helperSuggestionFor(activeStep, draft));
    setHelperOpen(true);
  }

  async function applyHelperSuggestion() {
    if (!helperSuggestion) return;
    await submitBuilderCommand(helperSuggestion);
    setHelperOpen(false);
    setStatusMessage("Helper suggestion applied to the current step.");
  }

  function goNext() {
    if (activeStep === "missing") setActiveStep("flights");
    else if (activeStep === "flights") setActiveStep("hotel");
    else if (activeStep === "hotel") setActiveStep("transfer");
    else if (activeStep === "transfer") setActiveStep("itinerary");
    else if (activeStep === "itinerary") setActiveStep("client_review");
    else if (activeStep === "client_review") setActiveStep("approval");
  }

  return (
    <section className="ops-card request-detail-card">
      <div className="selected-trip-hero">
        <div>
          <h2>{draft.travellerName}</h2>
          <span className="request-card-id">{draft.id}</span>
          <p>{draft.company} · {draft.purpose || "Business travel"}</p>
          <strong>{routeText(draft)}</strong>
          <span>{formatDate(draft.departDate)} - {formatDate(draft.returnDate)} · Tier-based hotel policy</span>
        </div>
        <div>
          <StatusPill value={draft.status} />
          <strong>Next: {nextActionFor(draft)}</strong>
        </div>
      </div>
      {draft.criticalIssueStatus === "Urgent" ? (
        <div className="critical-issue-banner" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>Critical issue active</strong>
            <span>{draft.criticalIssue || "Urgent travel disruption"}</span>
          </div>
          <button className="secondary-button" type="button" onClick={() => setActiveStep("flights")}>Open Recovery Step</button>
        </div>
      ) : null}
      {travelerProfileWarning ? (
        <div className="critical-issue-banner" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>New traveler profile</strong>
            <span>{travelerProfileWarning}</span>
          </div>
        </div>
      ) : null}
      <div className="builder-stepper" aria-label="Guided itinerary steps">
        {WORKSPACE_STEPS.map((step, index) => (
          <button
            aria-current={activeStep === step.id ? "step" : undefined}
            className={activeStep === step.id ? "active" : ""}
            key={step.id}
            type="button"
            onClick={() => setActiveStep(step.id)}
          >
            <span>{index + 1}</span>{step.label}
          </button>
        ))}
      </div>
      {statusMessage ? <p className="workspace-status" role="status">{statusMessage}</p> : null}

      <section className="guided-builder">
        <aside className="builder-summary-rail" aria-label="Request context">
          <BuilderSummary request={draft} selectedFlight={selectedFlightOffer} selectedHotel={selectedHotelOffer} selectedTransfer={selectedGroundTransferOffer} />
        </aside>
        <main className="builder-main-panel">
          <BuilderGuide
            activeStep={activeStep}
            guideMessage={guideMessage}
            request={draft}
            recoveryMode={recoveryMode}
            selectedFlight={selectedFlightOffer}
            selectedHotel={selectedHotelOffer}
          />
          <BuilderCommand
            activeStep={activeStep}
            assistantStatus={assistantStatus}
            commandInput={commandInput}
            onChange={setCommandInput}
            onHelp={explainCurrentStep}
            onSubmit={() => void submitBuilderCommand()}
          />
          {activeStep === "missing" ? (
            <section className="builder-step-panel" aria-label="Missing information">
              <EditableSection title="Missing Information" icon={AlertTriangle} value={draft.missingInformation} onChange={(value) => updateDraft("missingInformation", value)} />
              <EditableSection title="Readiness Check" icon={ShieldCheck} value={draft.readinessCheck} onChange={(value) => updateDraft("readinessCheck", value)} />
              <EditableSection title="Customer Message Draft" icon={MessageSquare} value={draft.customerMessageDraft} onChange={(value) => updateDraft("customerMessageDraft", value)} />
            </section>
          ) : null}
          {activeStep === "flights" ? (
            <section className="builder-step-panel" aria-label="Flight options">
              {draft.flightOffers.length ? (
                <FlightOfferSelector
                  offers={draft.flightOffers}
                  selectedId={selectedFlightOffer?.id || draft.selectedFlightOfferId || draft.flightOffers[0].id}
                  recommendation={selectedPlan}
                  recoveryMode={recoveryMode}
                  onSelect={selectFlightOffer}
                />
              ) : (
                <div className="empty-panel">Generate a plan to load live or planning flight options.</div>
              )}
              <PlanSummaryStrip plan={selectedPlan} />
            </section>
          ) : null}
          {activeStep === "hotel" ? (
            <section className="builder-step-panel" aria-label="Hotel options">
              {draft.hotelOffers.length ? (
                <HotelOfferSelector
                  offers={draft.hotelOffers}
                  selectedId={selectedHotelOffer?.id || draft.selectedHotelOfferId || draft.hotelOffers[0].id}
                  recoveryMode={recoveryMode}
                  onSelect={selectHotelOffer}
                />
              ) : (
                <div className="empty-panel">Generate a plan to load live or planning hotel options.</div>
              )}
              <PlanSummaryStrip plan={selectedPlan} />
            </section>
          ) : null}
          {activeStep === "transfer" ? (
            <section className="builder-step-panel" aria-label="Airport transfer options">
              {draft.groundTransferOffers.length ? (
                <GroundTransferSelector
                  offers={draft.groundTransferOffers}
                  selectedId={selectedGroundTransferOffer?.id || draft.selectedGroundTransferOfferId || draft.groundTransferOffers[0].id}
                  onSelect={selectGroundTransferOffer}
                />
              ) : (
                <div className="empty-panel">Generate a plan to load planning airport transfer options.</div>
              )}
              <PlanSummaryStrip plan={selectedPlan} />
            </section>
          ) : null}
          {activeStep === "itinerary" ? (
            <section className="builder-step-panel" aria-label="Itinerary draft">
              <EditableSection title="AI Summary" icon={Sparkles} value={draft.aiSummary} onChange={(value) => updateDraft("aiSummary", value)} />
              <EditableSection title="Final Itinerary Preview" icon={ClipboardCheck} value={draft.finalItineraryDraft} onChange={(value) => updateDraft("finalItineraryDraft", value)} />
            </section>
          ) : null}
          {activeStep === "client_review" ? (
            <ClientReviewWorkspace request={draft} />
          ) : null}
          {activeStep === "approval" ? (
            <section className="builder-step-panel" aria-label="Approval and export">
              <EditableSection title="Policy Check" icon={WalletCards} value={draft.budgetPolicyCheck} onChange={(value) => updateDraft("budgetPolicyCheck", value)} />
              <div className="detail-info-card blue">
                <strong>Hotel tier</strong>
                <span>Based on submitted band</span>
                <strong>Approval</strong>
                <span>{draft.approvalStatus}</span>
                <strong>Selected cost</strong>
                <span>{selectedPlan ? formatMoney(selectedPlan.totalAmount, selectedPlan.currency) : "No plan selected"}</span>
              </div>
              <label className="approval-control">
                <span>Approval status</span>
                <select
                  aria-label="Approval status"
                  value={draft.approvalStatus}
                  onChange={(event) => updateDraft("approvalStatus", event.target.value as CorporateTravelRequest["approvalStatus"])}
                >
                  <option>Not Required</option>
                  <option>Required</option>
                  <option>Received</option>
                  <option>Rejected</option>
                </select>
              </label>
            </section>
          ) : null}
          <div className="builder-footer-actions">
            <button className="secondary-button" type="button" onClick={() => void generatePlan()} disabled={working}>
              <Sparkles size={16} /> {working ? "Planning..." : draft.flightOffers.length ? "Refresh Options" : "Generate Options"}
            </button>
            <button className="secondary-button" type="button" onClick={() => void runAutomatedPipeline()} disabled={working}>
              <Send size={16} /> Run Pipeline
            </button>
            <button className="secondary-button" type="button" onClick={() => void saveEdits()}><MessageSquare size={16} /> Save</button>
            {activeStep !== "approval" ? (
            <button className="primary-button" type="button" onClick={goNext} disabled={(activeStep === "flights" && !selectedFlightOffer) || (activeStep === "transfer" && !selectedGroundTransferOffer)}>
                Next: {nextBuilderLabel(activeStep)} <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button className="secondary-button" type="button" onClick={() => void sendApproval()} disabled={draft.approvalStatus !== "Required"}><Send size={16} /> Send Approval</button>
                <button className="secondary-button" type="button" onClick={() => void approveFinal()} disabled={draft.approvalStatus === "Rejected"}><ClipboardCheck size={16} /> Generate Final Itinerary</button>
                {draft.finalApproved || draft.status === "finalized" ? (
                  <button className="secondary-button" type="button" onClick={() => void downloadRequestPdf()}><Download size={16} /> Download PDF</button>
                ) : null}
              </>
            )}
          </div>
        </main>
      </section>
      {helperOpen ? (
        <HelperDrawer
          message={helperMessage}
          suggestion={helperSuggestion}
          onApply={() => void applyHelperSuggestion()}
          onClose={() => setHelperOpen(false)}
        />
      ) : null}

    </section>
  );
}

function BuilderSummary({
  request,
  selectedFlight,
  selectedHotel,
  selectedTransfer
}: {
  request: CorporateTravelRequest;
  selectedFlight?: CorporateFlightOffer;
  selectedHotel?: CorporateHotelOffer;
  selectedTransfer?: CorporateGroundTransferOffer;
}) {
  return (
    <div className="builder-summary-stack">
      <section>
        <p className="eyebrow">Request Context</p>
        <h3>{request.purpose || "Business trip"}</h3>
        <p>{routeText(request)}</p>
        <p>{formatDate(request.departDate)} - {formatDate(request.returnDate)}</p>
        <p>Hotel tier follows submitted band</p>
      </section>
      <section>
        <p className="eyebrow">Data Loaded</p>
        <p>{request.originalRequest ? "Travel form loaded" : "Travel form pending"}</p>
        <p>{compactPreferenceDisplay(request.preferences) || "Traveler preferences pending"}</p>
        <p>{compactReadinessDisplay(request.readinessCheck)}</p>
      </section>
      <section>
        <p className="eyebrow">Selected So Far</p>
        <p><strong>Flight:</strong> {selectedFlight ? selectedFlight.airline : "Not selected"}</p>
        <p><strong>Hotel:</strong> {selectedHotel ? selectedHotel.name : "Pending"}</p>
        <p><strong>Transfer:</strong> {selectedTransfer ? selectedTransfer.vehicleType || selectedTransfer.serviceType : "Pending"}</p>
        <p><strong>Approval:</strong> {request.approvalStatus}</p>
      </section>
    </div>
  );
}

function compactPreferenceDisplay(value: string) {
  const seen = new Set<string>();
  return value
    .split(/;|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .join("; ");
}

function compactReadinessDisplay(value: string) {
  if (!value.trim()) return "Readiness not generated";
  const field = (label: "Passport" | "Visa" | "Transit") => {
    const match = value.match(new RegExp(`${label}:\\s*([^\\n]*?)(?=\\s+(?:Passport|Visa|Transit):|\\n|$)`, "i"));
    return (match?.[1] || "Needs Review")
      .replace(/\b(Passport|Visa|Transit):\s*/gi, "")
      .split(/\s{2,}|\.|;/)[0]
      .trim()
      .slice(0, 80) || "Needs Review";
  };
  return `Passport: ${field("Passport")} · Visa: ${field("Visa")} · Transit: ${field("Transit")}`;
}

function BuilderGuide({
  activeStep,
  guideMessage,
  request,
  recoveryMode,
  selectedFlight,
  selectedHotel
}: {
  activeStep: WorkspaceStep;
  guideMessage: string;
  request: CorporateTravelRequest;
  recoveryMode: boolean;
  selectedFlight?: CorporateFlightOffer;
  selectedHotel?: CorporateHotelOffer;
}) {
  const titleByStep: Record<WorkspaceStep, string> = {
    missing: "Complete the missing trip context",
    flights: recoveryMode ? "Choose the recovery flight" : "Choose the flight option",
    hotel: "Choose the hotel option",
    transfer: "Choose the airport transfer",
    itinerary: "Review the itinerary draft",
    client_review: "Track client review",
    approval: "Complete approval and export"
  };
  const message = guideMessage || defaultGuideMessage(activeStep, request, recoveryMode, selectedFlight, selectedHotel);
  return (
    <section className="builder-guide" aria-live="polite">
      <span className="builder-guide-avatar">AI</span>
      <div>
        <h3>{titleByStep[activeStep]}</h3>
        <p>{message}</p>
      </div>
    </section>
  );
}

function BuilderCommand({
  activeStep,
  assistantStatus,
  commandInput,
  onChange,
  onHelp,
  onSubmit
}: {
  activeStep: WorkspaceStep;
  assistantStatus: "idle" | "responding";
  commandInput: string;
  onChange: (value: string) => void;
  onHelp: () => void;
  onSubmit: () => void;
}) {
  return (
    <form className="builder-command-row" onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}>
      <input
        aria-label={`Guide command for ${WORKSPACE_STEPS.find((step) => step.id === activeStep)?.label || "current step"}`}
        value={commandInput}
        onChange={(event) => onChange(event.target.value)}
        placeholder={commandPlaceholder(activeStep)}
      />
      <button className="secondary-button" type="button" onClick={onHelp}><MessageSquare size={16} /> Help me understand</button>
      <button className="primary-button" type="submit" disabled={assistantStatus === "responding"}>
        {assistantStatus === "responding" ? <><RefreshCw className="spin-icon" size={16} /> Updating...</> : "Update Step"}
      </button>
    </form>
  );
}

function HelperDrawer({
  message,
  suggestion,
  onApply,
  onClose
}: {
  message: string;
  suggestion: string;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="helper-drawer" role="dialog" aria-label="Helper explanation">
      <div className="helper-drawer-card">
        <div className="card-title-row">
          <h3><MessageSquare size={17} /> Helper</h3>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
        <p>{message}</p>
        {suggestion ? (
          <div className="helper-suggestion">
            <strong>Suggested update</strong>
            <p>{suggestion}</p>
            <button className="primary-button" type="button" onClick={onApply}>Apply to itinerary</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlanSummaryStrip({ plan }: { plan?: CorporatePlanOption }) {
  if (!plan) return null;
  return (
    <div className="ai-recommendation-strip">
      <Sparkles size={16} />
      <div>
        <strong>{plan.name}</strong>
        <span>{plan.policyFit}</span>
      </div>
      <p>{plan.tradeoffs || plan.flightSummary || plan.hotelSummary}</p>
    </div>
  );
}

function nextBuilderLabel(step: WorkspaceStep) {
  if (step === "missing") return "Select Flight";
  if (step === "flights") return "Select Hotel";
  if (step === "hotel") return "Select Transfer";
  if (step === "transfer") return "Review Itinerary";
  if (step === "itinerary") return "Client Review";
  if (step === "client_review") return "Approval & Export";
  return "Done";
}

function commandPlaceholder(step: WorkspaceStep) {
  if (step === "missing") return "Add a missing detail, e.g. passport expiry is valid until 2030...";
  if (step === "flights") return "Type: arrive before 11am, avoid overnight layover, fastest recovery...";
  if (step === "hotel") return "Type: hotel near client office, refundable, 4 star, adjust dates...";
  if (step === "transfer") return "Type: airport pickup, executive car, extra luggage, meet-and-greet...";
  if (step === "itinerary") return "Type: add vegetarian meal note, explain disruption, shorten traveler message...";
  if (step === "client_review") return "Type: summarize the latest client review status or requested edits...";
  return "Type: explain approval reason, mark approval received, prepare final export...";
}

function defaultGuideMessage(
  step: WorkspaceStep,
  request: CorporateTravelRequest,
  recoveryMode: boolean,
  selectedFlight?: CorporateFlightOffer,
  selectedHotel?: CorporateHotelOffer
) {
  if (step === "missing") return request.missingInformation || "Review missing data from the uploaded form before generating options.";
  if (step === "flights") {
    return recoveryMode
      ? "This is a recovery workflow. Pick a same-origin replacement first, then we will adjust hotels and the traveler update."
      : "Pick the flight that best balances policy and schedule. You can type constraints to update the visible options.";
  }
  if (step === "hotel") return selectedFlight ? `Flight selected: ${selectedFlight.airline}. Now choose a hotel that fits the arrival timing and company policy.` : "Select a flight first, then choose the hotel.";
  if (step === "transfer") return "Choose the airport pickup option that fits the arrival timing, passenger count, and baggage needs.";
  if (step === "itinerary") return selectedHotel ? `Hotel selected: ${selectedHotel.name}. Review the traveler-ready itinerary before approval.` : "Review the itinerary and add any traveler-facing notes.";
  if (step === "client_review") return request.clientReview ? `Client review is ${request.clientReview.status}. Round ${request.clientReview.revisionRound}.` : "Run the pipeline to send the signed client review dashboard link.";
  return "Confirm the approval posture, generate the final itinerary, and export only after agent review.";
}

function helperExplanation(
  step: WorkspaceStep,
  request: CorporateTravelRequest,
  selectedFlight?: CorporateFlightOffer,
  selectedHotel?: CorporateHotelOffer
) {
  if (step === "missing") return "This step collects blockers before options are trusted. Saving here updates the same request record used by the later flight, hotel, itinerary, and approval steps.";
  if (step === "flights") return selectedFlight
    ? `${selectedFlight.airline} is selected. The card shows timings, cost, source type, and whether it is a recovery option.`
    : "Select a flight card to make it the active option for hotel planning and itinerary drafting.";
  if (step === "hotel") return selectedHotel
    ? `${selectedHotel.name} is selected. Hotel selection updates the itinerary context for the pipeline test.`
    : "Hotel cards use live data when connected or stable planning images when photos are missing.";
  if (step === "transfer") return "Transfer cards use varied planning estimates for the pipeline test.";
  if (step === "itinerary") return "This is the traveler-facing draft. You can edit it directly or ask the guide to rewrite the current draft.";
  if (step === "client_review") return "This tab tracks the signed dashboard link, client approval, edit requests, and revision history for the traveler-facing review flow.";
  return request.approvalStatus === "Required"
    ? "Approval is required before final export. Mark approval as received only after the approval band owner has approved the itinerary."
    : "Approval is not currently required. Final export is still gated by agent review.";
}

function helperSuggestionFor(step: WorkspaceStep, request: CorporateTravelRequest) {
  if (step === "missing") return "Add the latest missing traveler detail to the request notes and continue to flight selection.";
  if (step === "flights") return request.criticalIssueStatus === "Urgent"
    ? "Prioritize the fastest same-origin recovery flight and explain hotel impact after selection."
    : "Rank the visible flights by policy fit, arrival timing, and total cost.";
  if (step === "hotel") return "Prioritize hotels near the client office with refundable terms and policy-fit nightly cost.";
  if (step === "transfer") return "Prioritize airport pickup with clear pickup timing, passenger fit, and baggage buffer.";
  if (step === "itinerary") return "Rewrite the itinerary so it clearly states selected flight, selected hotel, pending approval, and special service requests.";
  if (step === "client_review") return "Summarize the current client review state and next action for the agent.";
  return "Summarize why approval is or is not required before final export.";
}

function EditableSection({ title, icon: Icon, value, onChange }: { title: string; icon: LucideIcon; value: string; onChange: (value: string) => void }) {
  return (
    <section className="ops-card editable-section">
      <div className="card-title-row">
        <h3><Icon size={17} /> {title}</h3>
      </div>
      <textarea aria-label={title} value={value} onChange={(event) => onChange(event.target.value)} />
    </section>
  );
}

function FlightOfferSelector({
  offers,
  selectedId,
  recommendation,
  recoveryMode = false,
  onSelect
}: {
  offers: CorporateFlightOffer[];
  selectedId: string;
  recommendation?: CorporatePlanOption;
  recoveryMode?: boolean;
  onSelect: (id: string) => void;
}) {
  const selectedOffer = offers.find((offer) => offer.id === selectedId) || offers[0];

  return (
    <section className="flight-offer-section">
      <div className="card-title-row">
        <h3><Plane size={17} /> Select Airline</h3>
        <StatusPill value={offers.some((offer) => offer.source === "duffel") ? "Live Flight Options" : "AI Ranked Options"} />
      </div>
      <div className="flight-offer-grid">
        {offers.map((offer) => (
          <article className={offer.id === selectedId ? "flight-offer-card selected" : "flight-offer-card"} key={offer.id}>
            <img className="offer-card-image" src={flightImageFor(offer, recoveryMode)} alt={`${offer.airline} flight visual`} />
            <div className="card-title-row">
              <h4>{offer.airline}</h4>
              <button className="secondary-button" type="button" onClick={() => onSelect(offer.id)}>
                {offer.id === selectedId ? "Selected" : "Select Flight"}
              </button>
            </div>
            <div className="offer-card-badges">
              <StatusPill value={offer.source === "duffel" ? "Live flight" : "Planning option"} />
              {recoveryMode ? <StatusPill value="Recovery" /> : null}
            </div>
            <strong>{formatMoney(offer.totalAmount, offer.currency)}</strong>
            <p>{offer.outbound}</p>
            {offer.returnLeg ? <p>{offer.returnLeg}</p> : null}
            <small>{offer.source === "duffel" ? "Live fare source" : "Planning source"}</small>
            {offer.expiresAt ? <small>Offer expires {offer.expiresAt}</small> : null}
          </article>
        ))}
      </div>
      {recommendation ? (
        <div className="ai-recommendation-strip">
          <Sparkles size={16} />
          <div>
            <strong>AI recommendation</strong>
            <span>{recommendation.name}: {selectedOffer?.airline || recommendation.flightSummary} · {recommendation.policyFit}</span>
          </div>
          <p>{recommendation.tradeoffs}</p>
        </div>
      ) : null}
    </section>
  );
}

function HotelOfferSelector({
  offers,
  selectedId,
  recoveryMode = false,
  onSelect
}: {
  offers: CorporateHotelOffer[];
  selectedId: string;
  recoveryMode?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="flight-offer-section">
      <div className="card-title-row">
        <h3><Building2 size={17} /> Select Hotel</h3>
        <StatusPill value={offers.some((offer) => offer.source === "booking") ? "Live Hotel Options" : "Planning Options"} />
      </div>
      <div className="flight-offer-grid">
        {offers.map((offer) => (
          <article className={offer.id === selectedId ? "flight-offer-card hotel-offer-card selected" : "flight-offer-card hotel-offer-card"} key={offer.id}>
            <img className="offer-card-image" src={hotelImageFor(offer)} alt={`${offer.name} hotel visual`} />
            <div className="card-title-row">
              <h4>{offer.name}</h4>
              <button className="secondary-button" type="button" onClick={() => onSelect(offer.id)}>
                {offer.id === selectedId ? "Selected" : "Select Hotel"}
              </button>
            </div>
            <div className="offer-card-badges">
              <StatusPill value={offer.source === "booking" ? "Live hotel" : "Planning hotel"} />
              {recoveryMode ? <StatusPill value="Dates checked" /> : null}
            </div>
            <strong>{formatMoney(offer.totalAmount, offer.currency)}</strong>
            <p>{offer.summary}</p>
            {offer.address ? <p>{offer.address}</p> : null}
            <small>{offer.starRating ? `${offer.starRating}-star · ` : ""}{offer.nights} night{offer.nights === 1 ? "" : "s"} · {offer.rooms} room · {offer.guests} guest{offer.guests === 1 ? "" : "s"}</small>
            <small>{offer.source === "booking" ? "Live lodging source" : "Planning source"}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function GroundTransferSelector({
  offers,
  selectedId,
  onSelect
}: {
  offers: CorporateGroundTransferOffer[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="flight-offer-section">
      <div className="card-title-row">
        <h3><Car size={17} /> Select Airport Transfer</h3>
        <StatusPill value="Planning Options" />
      </div>
      <div className="flight-offer-grid">
        {offers.map((offer) => (
          <article className={offer.id === selectedId ? "flight-offer-card selected" : "flight-offer-card"} key={offer.id}>
            <div className="card-title-row">
              <h4>{offer.vehicleType || offer.serviceType}</h4>
              <button className="secondary-button" type="button" onClick={() => onSelect(offer.id)}>
                {offer.id === selectedId ? "Selected" : "Select Transfer"}
              </button>
            </div>
            <div className="offer-card-badges">
              <StatusPill value="Planning transfer" />
              <StatusPill value={offer.serviceType} />
            </div>
            <strong>{formatMoney(offer.totalAmount, offer.currency)}</strong>
            <p>{offer.pickupAirportCode} pickup{offer.pickupTime ? ` at ${formatDateTimeText(offer.pickupTime)}` : ""}</p>
            <p>{offer.dropoffLabel}{offer.dropoffAddress ? ` · ${offer.dropoffAddress}` : ""}</p>
            {offer.baggage ? <small>{offer.baggage}</small> : null}
            {offer.cancellationNotes ? <small>{offer.cancellationNotes}</small> : null}
            <small>Ground transport source</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ClientReviewWorkspace({ request }: { request: CorporateTravelRequest }) {
  const review = request.clientReview;
  const latestHistory = [...request.clientReviewHistory].reverse();
  return (
    <section className="builder-step-panel" aria-label="Client review status">
      <div className="detail-info-card blue">
        <strong>Status</strong>
        <span>{review?.status || "Not Sent"}</span>
        <strong>Revision round</strong>
        <span>{review?.revisionRound ?? 0}</span>
        <strong>Selected option</strong>
        <span>{review?.selectedOptionIndex ? `Option ${review.selectedOptionIndex}` : "Pending"}</span>
        <strong>Expires</strong>
        <span>{review?.expiresAt ? formatDateTimeText(review.expiresAt) : "No active link"}</span>
      </div>
      {review?.changeSummary ? (
        <div className="ai-recommendation-strip">
          <Sparkles size={16} />
          <div>
            <strong>What changed</strong>
            <span>{review.changeSummary}</span>
          </div>
        </div>
      ) : null}
      {review?.reviewUrl ? (
        <a className="secondary-button" href={review.reviewUrl} target="_blank" rel="noreferrer">
          <Send size={16} /> Open Client Dashboard
        </a>
      ) : (
        <div className="empty-panel">Run the automated pipeline to send the signed client review link.</div>
      )}
      <div className="review-history-list">
        {latestHistory.length ? latestHistory.map((event) => (
          <article className="review-history-item" key={event.id}>
            <strong>{reviewActionLabel(event.action)} · Round {event.revisionRound}</strong>
            <span>{formatDateTimeText(event.createdAt)}</span>
            {event.editRequestText ? <p>{event.editRequestText}</p> : null}
            {event.changeSummary ? <p>{event.changeSummary}</p> : null}
          </article>
        )) : <div className="empty-panel">No client review activity yet.</div>}
      </div>
    </section>
  );
}

function reviewActionLabel(action: string) {
  if (action === "approved") return "Approved";
  if (action === "cancelled") return "Cancelled";
  if (action === "edits_requested") return "Edits Requested";
  if (action === "agent_review_required") return "Agent Review Required";
  return "Review Link Sent";
}

function flightImageFor(offer: CorporateFlightOffer, recoveryMode: boolean) {
  if (recoveryMode) return "/travel-media/flight-recovery.png";
  return "/travel-media/flight-aircraft.png";
}

function hotelImageFor(offer: CorporateHotelOffer) {
  if (offer.imageUrl) return offer.imageUrl;
  const text = `${offer.name} ${offer.summary}`.toLowerCase();
  if (text.includes("premium") || text.includes("flex")) return "/travel-media/hotel-lobby.png";
  if (text.includes("city") || text.includes("office")) return "/travel-media/hotel-city.png";
  return "/travel-media/hotel-business.png";
}

const CLIENT_REVIEW_MAX_EDIT_ROUNDS = 3;

export function ClientReviewPortalScreen({ token }: { token: string }) {
  const [review, setReview] = useState<ClientReviewResponse | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [editRequest, setEditRequest] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<"approve" | "edits" | "cancel" | null>(null);
  const submitting = pendingAction !== null;
  const approved = review?.status === "Approved";
  const cancelled = review?.status === "Cancelled";
  const agentReviewRequired = review?.status === "Agent Review Required";
  const editRoundsRemaining = review ? Math.max(0, CLIENT_REVIEW_MAX_EDIT_ROUNDS - review.revisionRound) : CLIENT_REVIEW_MAX_EDIT_ROUNDS;
  const canRequestEdits = Boolean(review && !approved && !cancelled && !agentReviewRequired && editRoundsRemaining > 0);
  const approvedOptionIndex = review?.history.slice().reverse().find((event) => event.action === "approved")?.selectedOptionIndex || selectedOption;
  const activeOption = review?.options.find((option) => option.optionIndex === activeOptionIndex) || review?.options[0] || null;
  const activeOptionPosition = review && activeOption ? review.options.findIndex((option) => option.optionIndex === activeOption.optionIndex) : -1;
  const hasMultipleOptions = (review?.options.length || 0) > 1;

  useEffect(() => {
    let mounted = true;
    async function loadReview() {
      setLoading(true);
      try {
        const result = await getClientReview(token);
        if (!mounted) return;
        setReview(result);
        setActiveOptionIndex(result.options[0]?.optionIndex || null);
        setSelectedOption(null);
        setStatusMessage("");
      } catch {
        if (mounted) setStatusMessage("This review link is unavailable or expired.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadReview();
    return () => {
      mounted = false;
    };
  }, [token]);

  async function approveOption(optionIndex: number) {
    setSelectedOption(optionIndex);
    setPendingAction("approve");
    setStatusMessage("");
    try {
      const result = await submitClientReview(token, { action: "approve", selected_option_index: optionIndex });
      setReview(result);
      setSelectedOption(optionIndex);
      setStatusMessage("Thank you. You will receive a mail shortly.");
    } catch {
      setStatusMessage("Approval could not be submitted. Please contact the travel team.");
    } finally {
      setPendingAction(null);
    }
  }

  async function requestEdits() {
    const comment = editRequest.trim();
    if (!comment) {
      setStatusMessage("Add the requested edits before submitting.");
      return;
    }
    if (!canRequestEdits) {
      setStatusMessage("The 3 update tries have been used. The travel team will review any further changes.");
      return;
    }
    setPendingAction("edits");
    setStatusMessage("Updating itineraries. This can take a moment.");
    try {
      const result = await submitClientReview(token, { action: "request_edits", edit_request_text: comment });
      setReview(result);
      setActiveOptionIndex(result.options[0]?.optionIndex || null);
      setSelectedOption(null);
      setEditRequest("");
      setStatusMessage(result.status === "Agent Review Required" ? "Your edits were sent to the travel team for review." : "Itineraries updated on screen. Review the refreshed options below.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Edit request could not be submitted. Please contact the travel team.");
    } finally {
      setPendingAction(null);
    }
  }

  async function cancelReview() {
    setPendingAction("cancel");
    setStatusMessage("");
    try {
      const result = await submitClientReview(token, { action: "cancel" });
      setReview(result);
      setActiveOptionIndex(null);
      setSelectedOption(null);
      setStatusMessage("Request cancelled. The travel team will not finalize this itinerary.");
    } catch {
      setStatusMessage("Cancellation could not be submitted. Please contact the travel team.");
    } finally {
      setPendingAction(null);
    }
  }

  function showRelativeOption(offset: number) {
    if (!review?.options.length) return;
    const currentPosition = activeOptionPosition >= 0 ? activeOptionPosition : 0;
    const nextPosition = (currentPosition + offset + review.options.length) % review.options.length;
    setActiveOptionIndex(review.options[nextPosition].optionIndex);
  }

  return (
    <main className="client-review-page">
      <section className="client-review-header">
        <div>
          <p className="eyebrow">Client Review Dashboard</p>
          <h1>{review?.travelerName || "Itinerary Review"}</h1>
          <p>{review ? `${review.companyName} · ${review.route}` : "Loading itinerary options..."}</p>
        </div>
        {review ? (
          <div className="detail-info-card blue">
            <strong>Status</strong>
            <span>{review.status}</span>
            <strong>Round</strong>
            <span>{review.revisionRound}</span>
          </div>
        ) : null}
      </section>
      {statusMessage ? <p className="workspace-status" role="status">{statusMessage}</p> : null}
      {loading ? <section className="empty-panel">Opening itinerary review...</section> : null}
      {review ? (
        <>
          {approved ? (
            <section className="client-thank-you-panel">
              <CheckCircle2 size={34} />
              <div>
                <h2>Thank you</h2>
                <p>You will receive a mail shortly with the approved itinerary.</p>
                {approvedOptionIndex ? <span>Approved option {approvedOptionIndex}</span> : null}
              </div>
            </section>
          ) : null}
          {cancelled ? (
            <section className="client-thank-you-panel">
              <Trash2 size={34} />
              <div>
                <h2>Request cancelled</h2>
                <p>The travel team will not finalize this itinerary.</p>
              </div>
            </section>
          ) : null}
          {review.changeSummary ? (
            <section className="ai-recommendation-strip">
              <Sparkles size={16} />
              <div>
                <strong>What changed</strong>
                <span>{review.changeSummary}</span>
              </div>
            </section>
          ) : null}
          {!approved && !cancelled ? (
            <>
              {pendingAction === "edits" ? (
                <section className="client-review-loading" aria-label="Updating itinerary options">
                  <RefreshCw size={18} />
                  <span>Updating itinerary options...</span>
                </section>
              ) : null}
              <section className="client-review-switcher" aria-label="Itinerary option selector">
                <div className="client-review-tabs" role="tablist" aria-label="Itinerary options">
                  {review.options.map((option) => {
                    const displayName = clientReviewOptionDisplayName(option);
                    return (
                      <button
                        key={option.optionIndex}
                        className={activeOption?.optionIndex === option.optionIndex ? "client-review-tab active" : "client-review-tab"}
                        type="button"
                        role="tab"
                        aria-selected={activeOption?.optionIndex === option.optionIndex}
                        onClick={() => setActiveOptionIndex(option.optionIndex)}
                      >
                        <span>Option {option.optionIndex}</span>
                        <strong>{displayName}</strong>
                        <em>{formatMoney(option.estimatedCost, option.currency)}</em>
                      </button>
                    );
                  })}
                </div>
                <div className="client-review-turn-controls">
                  <button className="secondary-button" type="button" onClick={() => showRelativeOption(-1)} disabled={!hasMultipleOptions}>
                    <ArrowLeft size={16} /> Previous
                  </button>
                  <span>{activeOptionPosition + 1} of {review.options.length}</span>
                  <button className="secondary-button" type="button" onClick={() => showRelativeOption(1)} disabled={!hasMultipleOptions}>
                    Next suggestion <ArrowRight size={16} />
                  </button>
                </div>
              </section>
              <section className="client-review-stage client-review-carousel" aria-label="Itinerary option details" aria-busy={pendingAction === "edits"}>
                <div
                  className="client-review-track"
                  style={{ transform: `translateX(-${Math.max(0, activeOptionPosition) * 100}%)` }}
                >
                  {review.options.map((option) => (
                    <div
                      className="client-review-slide"
                      key={`${review.revisionRound}-${option.optionIndex}`}
                      aria-hidden={activeOption?.optionIndex !== option.optionIndex}
                    >
                      <ClientReviewOptionCard
                        option={option}
                        displayName={clientReviewOptionDisplayName(option)}
                        selected={selectedOption === option.optionIndex}
                        submitting={submitting}
                        approving={pendingAction === "approve" && selectedOption === option.optionIndex}
                        onSelect={() => setSelectedOption(option.optionIndex)}
                        onApprove={() => void approveOption(option.optionIndex)}
                      />
                    </div>
                  ))}
                </div>
              </section>
              <section className="client-edit-panel">
                <div>
                  <div className="client-edit-title">
                    <h2>Request Edits</h2>
                    <span className="client-edit-help" tabIndex={0} aria-label="What can I request?">
                      <Info size={16} />
                    </span>
                    <span className="client-edit-tooltip" role="tooltip">
                      You can ask to change dates, destination, meeting location, hotel area, airline, traveler contact, passport or visa expiry. You can also type skip hotel or skip cab. Budget, band, policy, and cabin changes stay protected.
                    </span>
                  </div>
                  <p>{review.specialRequestNotice}</p>
                  <span>{editRoundsRemaining} of {CLIENT_REVIEW_MAX_EDIT_ROUNDS} update tries remaining</span>
                </div>
                <textarea
                  aria-label="Requested itinerary edits"
                  value={editRequest}
                  onChange={(event) => setEditRequest(event.target.value)}
                  placeholder="Example: change dates to 2026-07-10 to 2026-07-14, skip hotel, skip cab, move hotel closer to office"
                  disabled={submitting || !canRequestEdits}
                />
                <button className="secondary-button" type="button" onClick={() => void requestEdits()} disabled={submitting || !canRequestEdits}>
                  {pendingAction === "edits" ? <RefreshCw className="spin-icon" size={16} /> : <MessageSquare size={16} />}
                  {pendingAction === "edits" ? "Updating Itineraries..." : "Update Itineraries"}
                </button>
                <button className="secondary-button" type="button" onClick={() => void cancelReview()} disabled={submitting}>
                  {pendingAction === "cancel" ? <RefreshCw className="spin-icon" size={16} /> : <Trash2 size={16} />}
                  {pendingAction === "cancel" ? "Cancelling..." : "Cancel Request"}
                </button>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function ClientReviewOptionCard({
  option,
  displayName,
  selected,
  submitting,
  approving,
  onSelect,
  onApprove
}: {
  option: ClientReviewOption;
  displayName: string;
  selected: boolean;
  submitting: boolean;
  approving: boolean;
  onSelect: () => void;
  onApprove: () => void;
}) {
  const flightRows = flightReviewRows(option);
  const hotelRows = hotelReviewRows(option);
  const transferRows = transferReviewRows(option);
  const proofPoints = option.pros.length ? option.pros : ["Balanced itinerary"];
  const watchOuts = option.cons.length ? option.cons : ["Final provider confirmation required"];
  const reasonPoints = reviewReasonPoints(option.recommendationReason);

  return (
    <article className={selected ? "client-review-option selected" : "client-review-option"}>
      <header className="client-option-header">
        <div className="client-option-title">
          <span>Option {option.optionIndex}</span>
          <h2>{displayName}</h2>
        </div>
        <button className={selected ? "selected-option-button" : "secondary-button"} type="button" onClick={onSelect}>
          {selected ? "Selected" : "Select"}
        </button>
      </header>
      <div className="client-option-price-row">
        <div>
          <span>Estimated total</span>
          <strong>{formatMoney(option.estimatedCost, option.currency)}</strong>
        </div>
        <StatusPill value={option.policyStatus} />
      </div>
      <section className="client-option-reason" aria-label={`Reason for option ${option.optionIndex}`}>
        <div>
          <Sparkles size={16} />
          <strong>{option.reasoningSourceLabel}</strong>
        </div>
        <ul>
          {reasonPoints.map((point) => <li key={point}>{point}</li>)}
        </ul>
      </section>
      <div className="client-option-proof">
        <div>
          <strong>Best for</strong>
          <div className="client-option-chip-row">
            {proofPoints.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div>
          <strong>Watch-outs</strong>
          <div className="client-option-chip-row muted">
            {watchOuts.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </div>
      <div className="review-segment-list">
        <FlightReviewSegment option={option} rows={flightRows} />
        <ReviewSegment
          icon={Building2}
          label={option.hotel?.name || "Hotel"}
          value={option.hotel?.summary || option.hotelSummary}
          rows={hotelRows}
          specialRequests={option.hotel?.unsentSpecialRequests || []}
          media={option.hotel ? <HotelReviewImage hotel={option.hotel} /> : null}
        />
        <ReviewSegment icon={Car} label="Airport Transfer" value={option.transfer?.vehicleType || option.transferSummary} rows={transferRows} />
      </div>
      <button className="primary-button" type="button" onClick={onApprove} disabled={submitting || !selected}>
        {approving ? <RefreshCw className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
        {approving ? "Approving..." : "Approve Option"}
      </button>
    </article>
  );
}

function clientReviewOptionDisplayName(option: ClientReviewOption) {
  if (option.optionName === "Best tier fit") return "Recommended value";
  if (option.optionName === "Fastest route") return "Fastest practical route";
  if (option.optionName === "Comfort-focused option") return "Comfort upgrade";
  return option.optionName;
}

function FlightReviewSegment({ option, rows }: { option: ClientReviewOption; rows: ReviewDetailRow[] }) {
  if (!option.flight) {
    return (
      <ReviewSegment
        icon={Plane}
        label="Flight"
        value={option.flightSummary}
        rows={rows}
      />
    );
  }

  const flight = option.flight;
  const legs = flightReviewLegs(option);
  const fare = formatMoney(flight.totalAmount, flight.currency);
  const providerBadge = flight.source === "duffel" ? "Live flight option" : "Planning estimate";

  return (
    <section className="review-segment flight-booking-card">
      <div className="flight-booking-header">
        <div className="flight-airline-lockup">
          <FlightBrandMark flight={flight} />
          <div>
            <div className="review-segment-title-row">
              <strong>{flight.airline || "Airline to confirm"}</strong>
              <span>{providerBadge}</span>
            </div>
            <p>{flight.summary || option.flightSummary}</p>
          </div>
        </div>
        <div className="flight-fare-block">
          <span>Flight fare</span>
          <strong>{fare}</strong>
        </div>
      </div>
      <div className="flight-leg-stack">
        {legs.map((leg) => (
          <div className="flight-leg-card" key={`${leg.label}-${leg.route}-${leg.departure}`}>
            <div className="flight-leg-label">
              <span>{leg.label}</span>
              <strong>{leg.airline || flight.airline || "Airline to confirm"}</strong>
            </div>
            <div className="flight-route-board">
              <div className="flight-time-point">
                <strong>{leg.departure ? formatClockText(leg.departure) : "Time pending"}</strong>
                <span>{flightEndpointText(leg.from, leg.departure)}</span>
              </div>
              <div className="flight-pathline">
                <span />
                <em>{leg.stops || "Nonstop"}</em>
              </div>
              <div className="flight-time-point end">
                <strong>{leg.arrival ? formatClockText(leg.arrival) : "Time pending"}</strong>
                <span>{flightEndpointText(leg.to, leg.arrival)}</span>
              </div>
            </div>
            <div className="flight-leg-meta">
              <span>{leg.route || "Route pending"}</span>
              {leg.layover ? <span>{leg.layover}</span> : null}
              {leg.duration ? <span>{leg.duration}</span> : null}
              <span>{cabinLabel(flight.cabin)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function reviewReasonPoints(value: string) {
  const clean = value.trim();
  if (!clean) return ["Recommendation is based on the submitted trip details."];
  const explicitLines = clean
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);
  if (explicitLines.length > 1) return explicitLines.slice(0, 4);
  return clean
    .split(/(?<=\.)\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
}

type ReviewDetailRow = {
  label: string;
  value: string;
};

function ReviewSegment({
  icon: Icon,
  label,
  value,
  rows,
  specialRequests = [],
  badge,
  marker,
  media
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  rows: ReviewDetailRow[];
  specialRequests?: string[];
  badge?: string;
  marker?: ReactNode;
  media?: ReactNode;
}) {
  return (
    <section className="review-segment">
      <div className="review-segment-heading">
        {marker || <span className="review-segment-icon"><Icon size={17} /></span>}
        <div>
          <div className="review-segment-title-row">
            <strong>{label}</strong>
            {badge ? <span>{badge}</span> : null}
          </div>
          <p>{value}</p>
        </div>
      </div>
      {media}
      <dl className="review-detail-list">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {specialRequests.length ? (
        <div className="special-request-panel">
          <strong>Special handling</strong>
          <ul>
            {specialRequests.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FlightBrandMark({ flight }: { flight?: ClientReviewOption["flight"] }) {
  if (flight?.airlineLogoUrl) {
    return (
      <span className="airline-brand-mark">
        <img src={flight.airlineLogoUrl} alt={`${flight.airline} logo`} />
      </span>
    );
  }
  return (
    <span className="airline-brand-mark text">
      {flight?.airlineCode || airlineInitials(flight?.airline || "") || <Plane size={17} />}
    </span>
  );
}

function HotelReviewImage({ hotel }: { hotel: NonNullable<ClientReviewOption["hotel"]> }) {
  const imageUrl = hotel.imageUrl || hotelReviewFallbackImage(hotel);
  return <img className="review-hotel-image" src={imageUrl} alt={`${hotel.name} hotel visual`} />;
}

function flightReviewSubtitle(option: ClientReviewOption) {
  if (!option.flight) return option.flightSummary;
  const provider = option.flight.source === "duffel" ? "Live flight offer" : "Planning estimate";
  return `${provider} · ${option.flight.summary}`;
}

function flightReviewRows(option: ClientReviewOption): ReviewDetailRow[] {
  const timing = parseFlightTiming(option.flight?.outbound || "", option.flight?.airline || "");
  const returnTiming = parseFlightTiming(option.flight?.returnLeg || "", option.flight?.airline || "");
  const rows: ReviewDetailRow[] = [
    { label: option.flight?.returnLeg ? "Outbound flight" : "Flight", value: flightRouteWithAirline(timing) || option.flightSummary || "Route pending" },
  ];
  if (option.flight) {
    rows.push({ label: "Outbound airline", value: timing.airline || option.flight.airline || "Airline to confirm" });
    if (timing.stops) {
      rows.push({ label: "Outbound stops", value: timing.stops });
    }
    const outboundLayover = timing.layover || flightLayoverText(timing.route, timing.stops);
    if (outboundLayover) {
      rows.push({ label: "Outbound layover", value: outboundLayover });
    }
  }
  rows.push(
    { label: option.flight?.returnLeg ? "Outbound depart" : "Depart", value: timing.departure ? formatReviewDateTimeText(timing.departure) : "Departure time pending" },
    { label: option.flight?.returnLeg ? "Outbound arrive" : "Arrive", value: timing.arrival ? formatReviewDateTimeText(timing.arrival) : "Arrival time pending" },
  );
  if (option.flight?.returnLeg) {
    rows.push(
      { label: "Return flight", value: flightRouteWithAirline(returnTiming) || option.flight.returnLeg },
      { label: "Return airline", value: returnTiming.airline || "Return airline to confirm" },
      ...(returnTiming.stops ? [{ label: "Return stops", value: returnTiming.stops }] : []),
      ...((returnTiming.layover || flightLayoverText(returnTiming.route, returnTiming.stops)) ? [{
        label: "Return layover",
        value: returnTiming.layover || flightLayoverText(returnTiming.route, returnTiming.stops),
      }] : []),
      { label: "Return depart", value: returnTiming.departure ? formatReviewDateTimeText(returnTiming.departure) : "Return departure time pending" },
      { label: "Return arrive", value: returnTiming.arrival ? formatReviewDateTimeText(returnTiming.arrival) : "Return arrival time pending" },
    );
  }
  if (option.flight) {
    rows.push({ label: "Total flight fare", value: formatMoney(option.flight.totalAmount, option.flight.currency) });
  }
  if (option.flight?.cabin) {
    rows.push({ label: "Cabin", value: cabinLabel(option.flight.cabin) });
  }
  return rows;
}

function flightReviewLegs(option: ClientReviewOption) {
  const outbound = parseFlightTiming(option.flight?.outbound || "", option.flight?.airline || "");
  const returnLeg = parseFlightTiming(option.flight?.returnLeg || "", option.flight?.airline || "");
  const outboundAirports = flightRouteAirports(outbound.route);
  const returnAirports = flightRouteAirports(returnLeg.route);
  const legs = [
    {
      label: option.flight?.returnLeg ? "Outbound" : "Flight",
      route: outbound.route,
      airline: outbound.airline || option.flight?.airline || "",
      stops: outbound.stops,
      layover: outbound.layover || flightLayoverText(outbound.route, outbound.stops),
      departure: outbound.departure,
      arrival: outbound.arrival,
      from: outboundAirports.from,
      to: outboundAirports.to,
      duration: flightLegDuration(option, "outbound"),
    },
  ];
  if (option.flight?.returnLeg) {
    legs.push({
      label: "Return",
      route: returnLeg.route,
      airline: returnLeg.airline || option.flight.airline || "",
      stops: returnLeg.stops,
      layover: returnLeg.layover || flightLayoverText(returnLeg.route, returnLeg.stops),
      departure: returnLeg.departure,
      arrival: returnLeg.arrival,
      from: returnAirports.from,
      to: returnAirports.to,
      duration: flightLegDuration(option, "return"),
    });
  }
  return legs;
}

function flightRouteAirports(route: string) {
  const airports = route.split(/\s*->\s*/).map((item) => item.trim()).filter(Boolean);
  return {
    from: airports[0] || "Origin",
    to: airports.length > 1 ? airports[airports.length - 1] : "Destination",
  };
}

function flightEndpointText(airport: string, value: string) {
  const dateText = value ? formatDate(value) : "Date pending";
  return `${airport} · ${dateText}`;
}

function flightLayoverText(route: string, stops: string) {
  if (!stops || /^nonstop$/i.test(stops)) return "";
  const via = stops.match(/\bvia\s+(.+)$/i)?.[1]?.trim();
  if (via) return `Layover ${via}`;
  const airports = route.split(/\s*->\s*/).map((item) => item.trim()).filter(Boolean);
  const layovers = airports.slice(1, -1);
  if (layovers.length) return `Layover ${layovers.join(", ")}`;
  return "Layover to confirm";
}

function flightLegDuration(option: ClientReviewOption, direction: "outbound" | "return") {
  const notes = option.flight?.notes || [];
  const prefix = direction === "outbound" ? /^Outbound\s+Duration:\s*(.+)$/i : /^Return\s+Duration:\s*(.+)$/i;
  const directed = notes.find((note) => prefix.test(note));
  if (directed) return directed.replace(prefix, "$1").trim();
  if (direction === "outbound") {
    const general = notes.find((note) => /^Duration:\s*/i.test(note));
    if (general) return general.replace(/^Duration:\s*/i, "").trim();
  }
  return "";
}

function hotelReviewRows(option: ClientReviewOption): ReviewDetailRow[] {
  if (!option.hotel) return [{ label: "Hotel", value: option.hotelSummary || "Hotel pending" }];
  return [
    { label: "Location", value: option.hotel.address || "Address pending" },
    { label: "Check-in", value: option.hotel.checkIn ? `${formatDate(option.hotel.checkIn)}${option.hotel.checkInStartsAt ? ` from ${formatClockText(option.hotel.checkInStartsAt)}` : ""}` : "Check-in date pending" },
    { label: "Checkout", value: option.hotel.checkOut ? `${formatDate(option.hotel.checkOut)}${option.hotel.checkoutTime ? ` by ${formatClockText(option.hotel.checkoutTime)}` : ""}` : "Checkout date pending" },
    { label: "Hotel cost", value: formatMoney(option.hotel.totalAmount, option.hotel.currency) },
    { label: "Room", value: option.hotel.roomNotes || "Room details require hotel confirmation" },
  ];
}

function transferReviewRows(option: ClientReviewOption): ReviewDetailRow[] {
  if (!option.transfer) return [{ label: "Transfer", value: option.transferSummary || "Transfer pending" }];
  return [
    { label: "Pickup", value: option.transfer.pickupTime ? `${option.transfer.pickupAirportCode} on ${formatReviewDateTimeText(option.transfer.pickupTime)}` : `${option.transfer.pickupAirportCode} pickup time pending` },
    { label: "Drop-off", value: [option.transfer.dropoffLabel, option.transfer.dropoffAddress].filter(Boolean).join(" · ") || "Drop-off pending" },
    { label: "Luggage", value: option.transfer.baggage || "Baggage allowance pending" },
    { label: "Airport transfer fare", value: formatMoney(option.transfer.totalAmount, option.transfer.currency) },
  ];
}

function parseFlightTiming(outbound: string, fallbackAirline = "") {
  const timestamps = outbound.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?/g) || [];
  const parts = outbound.split("·").map((part) => part.trim()).filter(Boolean);
  const airline = parts[1] && !isFlightTimingMeta(parts[1]) ? parts[1] : fallbackAirline;
  const stops = parts.find((part, index) => index > 1 && /\bstop/i.test(part)) || "";
  const layover = parts.find((part) => /^layover\b/i.test(part)) || "";
  return {
    route: parts[0] || "",
    airline,
    stops: normalizeStopText(stops),
    layover,
    departure: timestamps[0] || "",
    arrival: timestamps[1] || "",
  };
}

function isFlightTimingMeta(value: string) {
  return /\bstop\b|\blayover\b|^\d{4}-\d{2}-\d{2}T|^planning estimate$/i.test(value);
}

function normalizeStopText(value: string) {
  return value
    .replace(/\b1 stop\(s\)/i, "1 stop")
    .replace(/\b(\d+) stop\(s\)/i, "$1 stops");
}

function flightRouteWithAirline(timing: { route: string; airline: string }) {
  return [timing.airline, timing.route].filter(Boolean).join(" · ");
}

function cabinLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function airlineInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function hotelReviewFallbackImage(hotel: NonNullable<ClientReviewOption["hotel"]>) {
  const text = `${hotel.name} ${hotel.summary}`.toLowerCase();
  if (text.includes("premium") || text.includes("flex")) return "/travel-media/hotel-lobby.png";
  if (text.includes("city") || text.includes("office")) return "/travel-media/hotel-city.png";
  return "/travel-media/hotel-business.png";
}

export function TripPlannerScreen() {
  const [requests, setRequests] = useState<CorporateTravelRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    ensureTravelSession()
      .then(() => listCorporateRequests())
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  const filteredRequests = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter((request) => [
      request.id,
      request.travellerName,
      request.company,
      request.origin,
      request.destination,
      request.status,
      request.recommendedPlans.find((plan) => plan.selected)?.name || request.recommendedPlans[0]?.name || ""
    ].join(" ").toLowerCase().includes(query));
  }, [requests, searchTerm]);

  async function generatePlan(id: string) {
    if (workingId) return;
    setWorkingId(id);
    setStatusMessage("Generating itinerary options...");
    try {
      const planned = await generateCorporateTravelPlan(id);
      setRequests((current) => current.map((request) => request.id === planned.id ? planned : request));
      setStatusMessage("Itinerary options are ready for review.");
    } catch {
      setStatusMessage("Itinerary options are unavailable. Continue with manual review.");
    } finally {
      setWorkingId("");
    }
  }

  async function deleteItinerary(id: string) {
    const target = requests.find((request) => request.id === id);
    const confirmed = typeof window === "undefined" || window.confirm(`Delete itinerary for ${target?.travellerName || id}? This cannot be undone.`);
    if (!confirmed || deletingId) return;
    setDeletingId(id);
    setStatusMessage("");
    try {
      await deleteCorporateRequest(id);
      setRequests((current) => current.filter((request) => request.id !== id));
      setStatusMessage("Itinerary deleted.");
    } catch {
      setStatusMessage("Itinerary could not be deleted. Please try again.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <AppShell active="itineraries">
      <section className="page-heading">
        <div>
          <h1>Itinerary Planner</h1>
          <p>Review generated options, policy fit, and final itinerary readiness.</p>
        </div>
      </section>
      <section className="ops-card itinerary-page-card" aria-label="Itinerary queue">
        <div className="card-title-row">
          <h2>Itineraries</h2>
          <label className="queue-search">
            <Search size={15} />
            <input
              aria-label="Search itineraries"
              placeholder="Search traveler, route, status"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        </div>
        <div aria-label="Scrollable itinerary table" className="ticket-table-wrap" tabIndex={0}>
          <table className="ticket-table itinerary-table">
            <thead>
              <tr>
                <th scope="col">Traveler</th>
                <th scope="col">Route</th>
                <th scope="col">Selected Plan</th>
                <th scope="col">Estimated total</th>
                <th scope="col">Status</th>
                <th scope="col" className="ticket-actions-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length ? filteredRequests.map((request) => {
                const selectedPlan = request.recommendedPlans.find((plan) => plan.selected) || request.recommendedPlans[0] || null;
                return (
                  <tr key={request.id}>
                    <td>
                      <div className="ticket-identity">
                        <strong>{request.travellerName}</strong>
                        <span className="ticket-meta-line">
                          <span className="request-card-id">{request.id}</span>
                          <span aria-hidden="true">·</span>
                          <span>{request.company}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="ticket-route-cell">
                        <span>{request.origin || "Origin pending"}</span>
                        <ArrowRight size={14} />
                        <span>{request.destination || "Destination pending"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="itinerary-plan-cell">
                        <strong>{selectedPlan?.name || "Plan pending"}</strong>
                        <span>{selectedPlan?.policyFit || nextActionFor(request)}</span>
                      </div>
                    </td>
                    <td className="ticket-date-cell">{formatMoney(selectedPlan?.totalAmount || 0, selectedPlan?.currency || request.budgetCurrency)}</td>
                    <td><StatusPill value={request.status} /></td>
                    <td className="ticket-action-cell">
                      <div className="itinerary-action-stack">
                        <button
                          className="ticket-action-button"
                          type="button"
                          onClick={() => void generatePlan(request.id)}
                          disabled={workingId === request.id}
                        >
                          {workingId === request.id ? "Generating..." : "Generate Plan"}
                        </button>
                        <Link className="ticket-action-link" href={`/itineraries/${request.id}`}>Open Builder</Link>
                        <button
                          aria-label={`Delete itinerary for ${request.travellerName || request.id}`}
                          className="ticket-action-button delete"
                          type="button"
                          onClick={() => void deleteItinerary(request.id)}
                          disabled={deletingId === request.id}
                        >
                          <Trash2 size={14} /> {deletingId === request.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-panel">No itineraries match this search.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="queue-footer">
          <span>Showing {filteredRequests.length ? 1 : 0} to {filteredRequests.length} of {filteredRequests.length} itineraries</span>
          {statusMessage ? <span role="status">{statusMessage}</span> : null}
        </div>
      </section>
    </AppShell>
  );
}

export function CustomerIntakeScreen() {
  return <TravelerDashboard />;
}

export function RequestWorkspaceScreen({ requestId }: { requestId: string }) {
  const [requests, setRequests] = useState<CorporateTravelRequest[]>([]);
  const [notification, setNotification] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [finalizingRequest, setFinalizingRequest] = useState(false);

  useEffect(() => {
    ensureTravelSession()
      .then(() => listCorporateRequests())
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  const request = requests.find((item) => item.id === requestId) || requests[0] || null;
  const selectedFlight = request?.flightOffers.find((offer) => offer.id === request.selectedFlightOfferId) || request?.flightOffers[0] || null;
  const selectedHotel = request?.hotelOffers.find((offer) => offer.id === request.selectedHotelOfferId) || request?.hotelOffers[0] || null;
  const communicationItems = request ? [
    {
      icon: MessageSquare,
      label: "Client request received",
      meta: request.requesterEmail || request.travellerEmail || "Sender email",
      body: `${request.origin || "Origin pending"} to ${request.destination || "Destination pending"} · ${request.departDate || "TBD"} to ${request.returnDate || "TBD"}`,
      detail: request.preferences ? "Traveler preferences were captured from the intake form." : request.originalRequest || "Travel form details are attached to this request."
    },
    {
      icon: Sparkles,
      label: request.aiSummary ? "AI draft prepared" : "AI draft pending",
      meta: request.aiSummary ? "Plan generated" : "Generate plan",
      body: request.aiSummary ? "Draft summary is ready for agent review." : "Generate a plan to create the customer-facing draft and policy notes.",
      detail: selectedFlight || selectedHotel
        ? [selectedFlight?.airline, selectedHotel?.name].filter(Boolean).join(" + ")
        : request.budgetPolicyCheck || "No option selected yet."
    },
    {
      icon: ShieldCheck,
      label: "Approval status",
      meta: request.approvalStatus === "Required" ? "Approval required" : request.approvalStatus || "Not required",
      body: request.finalApproved ? "Approval received and recorded for this itinerary." : "Approval is not yet recorded for final handoff.",
      detail: request.criticalIssueStatus === "Urgent" ? request.criticalIssue || "Critical issue is marked urgent." : "No urgent communication flag is active."
    },
    {
      icon: FileText,
      label: request.status === "finalized" ? "Final PDF ready" : "Final PDF pending",
      meta: request.status === "finalized" ? "Ready to send" : "Agent review required",
      body: request.status === "finalized"
        ? "Final itinerary PDF can be sent to the client with the selected flight and hotel."
        : "Finalize after agent review to unlock the client PDF handoff.",
      detail: request.customerMessageDraft || request.finalItineraryDraft || "Client message will appear after planning."
    }
  ] : [];

  async function generatePlan() {
    if (!request) return;
    setGeneratingPlan(true);
    setNotification("Generating plan...");
    try {
      const planned = await generateCorporateTravelPlan(request.id);
      setRequests((current) => current.map((item) => item.id === planned.id ? planned : item));
      setNotification("Plan generated for workspace review.");
    } catch {
      setNotification("Plan generation is unavailable. Continue with manual review.");
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function sendApprovalEmail() {
    if (!request) return;
    const recipientEmail = request.requesterEmail || request.travellerEmail;
    if (!recipientEmail) {
      setNotification("Approval email needs a sender or traveller email on the request.");
      return;
    }
    setSendingNotification(true);
    setNotification("Sending approval email...");
    try {
      const result = await sendCorporateRequestNotification(request.id, {
        kind: "approval_request",
        to: [recipientEmail],
        note: "Please review this travel plan.",
        attach_itinerary: false
      });
      setNotification(result.safe_message);
    } catch {
      setNotification("Approval email could not be sent. Continue with manual follow-up.");
    } finally {
      setSendingNotification(false);
    }
  }

  async function sendFinalItineraryEmail() {
    if (!request) return;
    if (request.status !== "finalized" || !request.finalApproved) {
      setNotification("Final itinerary email requires approval and finalization.");
      return;
    }
    const recipientEmail = request.requesterEmail || request.travellerEmail;
    if (!recipientEmail) {
      setNotification("Final itinerary email needs a sender or traveller email on the request.");
      return;
    }
    setSendingNotification(true);
    setNotification("Sending final itinerary email...");
    try {
      const result = await sendCorporateRequestNotification(request.id, {
        kind: "final_itinerary",
        to: [recipientEmail],
        note: "Final itinerary after agent review and approval.",
        attach_itinerary: true
      });
      setNotification(result.safe_message);
    } catch {
      setNotification("Final itinerary email could not be sent. Continue with manual follow-up.");
    } finally {
      setSendingNotification(false);
    }
  }

  async function finalizeItinerary() {
    if (!request) return;
    setFinalizingRequest(true);
    setNotification("Finalizing itinerary...");
    try {
      const finalized = await finalizeCorporateRequest(request.id, {
        agent_reviewed: true,
        approval_status: request.approvalStatus || "Received",
        finalApproved: true
      });
      setRequests((current) => current.map((item) => item.id === finalized.id ? finalized : item));
      setNotification("Final itinerary generated after agent review.");
    } catch {
      setNotification("Final itinerary is not ready. Complete approval and finalization before export.");
    } finally {
      setFinalizingRequest(false);
    }
  }

  async function downloadExport() {
    if (!request) return;
    try {
      const blob = await downloadCorporateRequestPdf(request.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${request.id}-final-itinerary.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotification("Final itinerary is not ready. Complete approval and finalization before export.");
    }
  }

  return (
    <AppShell active="requests">
      <section className="page-heading">
        <div>
          <h1>Request Workspace</h1>
          <p>Review the request, complete missing information, generate options, track approval, and finalize only after agent review.</p>
        </div>
        <Link className="secondary-button" href="/dashboard">Back to dashboard</Link>
      </section>
      <section className="workspace-grid">
        <article className="ops-card detail-card">
          <div className="card-title-row"><h2>{request?.travellerName || "No request selected"}</h2><StatusPill value={request?.status || "waiting"} /></div>
          <dl className="detail-list">
            <div><dt>Company</dt><dd>{request?.company || "No company loaded"}</dd></div>
            <div><dt>Route</dt><dd>{request ? `${request.origin} → ${request.destination}` : "No route loaded"}</dd></div>
            <div><dt>Dates</dt><dd>{request ? `${request.departDate || "TBD"} to ${request.returnDate || "TBD"}` : "TBD"}</dd></div>
            <div><dt>Approval</dt><dd>{request?.approvalStatus || "Not Required"}</dd></div>
          </dl>
          <button className="primary-button" type="button" onClick={() => void generatePlan()} disabled={generatingPlan || !request}><Sparkles size={16} /> Generate Plan</button>
        </article>
        <article className="ops-card detail-card">
          <h2>Detected Parameters</h2>
          <dl className="detail-list">
            <div><dt>Route</dt><dd>{request ? `${request.origin} → ${request.destination}` : "No route loaded"}</dd></div>
            <div><dt>Purpose</dt><dd>{request?.purpose || "Not captured"}</dd></div>
            <div><dt>Preferences</dt><dd>{request?.preferences || "No preferences captured"}</dd></div>
            <div><dt>Hotel tier</dt><dd>Based on submitted band</dd></div>
          </dl>
        </article>
        <article className="ops-card detail-card">
          <h2>Approval Tracking</h2>
          <p>Approval status: {request?.approvalStatus || "Not Required"}</p>
          <p>{request?.finalApproved ? "Approval received" : "Awaiting final approval"}</p>
          <p>{request?.status === "finalized" ? "Final itinerary complete" : "Agent review required before finalization."}</p>
        </article>
        <article className="ops-card detail-card">
          <h2>Communication Thread</h2>
          <div className="communication-thread">
            {communicationItems.length ? communicationItems.map((item) => {
              const Icon = item.icon;
              return (
                <div className="communication-item" key={item.label}>
                  <span className="communication-icon"><Icon size={16} /></span>
                  <div>
                    <div className="communication-item-head">
                      <strong>{item.label}</strong>
                      <span>{item.meta}</span>
                    </div>
                    <p>{item.body}</p>
                    <small>{item.detail}</small>
                  </div>
                </div>
              );
            }) : (
              <div className="communication-empty">No live request conversation loaded yet.</div>
            )}
          </div>
          <label className="thread-note">
            <span>Client-facing note</span>
            <textarea aria-label="Internal note" defaultValue={request?.customerMessageDraft || ""} />
          </label>
        </article>
        <article className="ops-card detail-card">
          <h2>Policy</h2>
          {request?.aiSummary ? <p>{request.aiSummary}</p> : null}
          <pre>{request?.budgetPolicyCheck || "Generate a plan to calculate policy posture."}</pre>
          <button className="primary-button" type="button" onClick={() => void sendApprovalEmail()} disabled={sendingNotification}><Send size={16} /> Send Approval Email</button>
          <button className="secondary-button" type="button" onClick={() => void finalizeItinerary()} disabled={finalizingRequest || !request}><CheckCircle2 size={16} /> Finalize Itinerary</button>
          <button className="secondary-button" type="button" onClick={() => void sendFinalItineraryEmail()} disabled={sendingNotification || !request}><Send size={16} /> Send PDF to Client</button>
          <button className="secondary-button" type="button" onClick={() => void downloadExport()} disabled={!request}><Download size={16} /> Download PDF</button>
          {notification ? <p role="status">{notification}</p> : null}
        </article>
      </section>
    </AppShell>
  );
}

export function ItineraryBuilderScreen({ requestId }: { requestId: string }) {
  const [requests, setRequests] = useState<CorporateTravelRequest[]>([]);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    ensureTravelSession()
      .then(() => listCorporateRequests())
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  const request = requests.find((item) => item.id === requestId) || requests[0] || null;
  const plans = request?.recommendedPlans || [];
  const selectedPlan = plans.find((plan) => plan.selected) || plans[0] || null;
  const total = selectedPlan?.totalAmount || 0;
  const manualSourcingRequired = plans.some((plan) => {
    const text = `${plan.flightSummary} ${plan.hotelSummary} ${plan.policyFit}`.toLowerCase();
    return text.includes("manual sourcing") || text.includes("manual review");
  });

  async function selectPlan(planId: string) {
    if (!request) return;
    const recommendedPlans = plans.map((plan) => ({ ...plan, selected: plan.id === planId }));
    try {
      const saved = await updateCorporateRequest(request.id, { recommendedPlans });
      setRequests((current) => current.map((item) => item.id === saved.id ? saved : item));
      setStatusMessage("Itinerary option selected.");
    } catch {
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, recommendedPlans } : item));
      setStatusMessage("Itinerary option selected locally. Backend update is unavailable.");
    }
  }

  async function optimizeItinerary() {
    if (!request) return;
    try {
      const optimized = await generateCorporateTravelPlan(request.id);
      setRequests((current) => current.map((item) => item.id === optimized.id ? optimized : item));
      setStatusMessage("Itinerary optimized for review.");
    } catch {
      setStatusMessage("Optimization is unavailable. Continue with manual review.");
    }
  }

  async function finalizeSelectedItinerary() {
    if (!request) return;
    try {
      const finalized = await finalizeCorporateRequest(request.id, {
        agent_reviewed: true,
        approval_status: "Received",
        finalApproved: true
      });
      setRequests((current) => current.map((item) => item.id === finalized.id ? finalized : item));
      setStatusMessage("Itinerary finalized.");
    } catch {
      setStatusMessage("Finalization is blocked. Complete approval and agent review before finalizing.");
    }
  }

  return (
    <AppShell active="itineraries">
      <section className="page-heading">
        <div>
          <h1>Itinerary Builder</h1>
          <p>Build the reviewed itinerary from verified travel options, policy warnings, and agent edits.</p>
        </div>
      </section>
      <section className="workspace-grid">
        <article className="ops-card detail-card">
          <span className="eyebrow">Estimated Total</span>
          <h2>Selected Option</h2>
          <dl className="detail-list">
            <div><dt>Selected spend</dt><dd>{formatMoney(total, selectedPlan?.currency || request?.budgetCurrency || "USD")}</dd></div>
            <div><dt>Hotel tier</dt><dd>Based on submitted band</dd></div>
          </dl>
          <h2>{formatMoney(total, request?.budgetCurrency || "USD")}</h2>
          <p>{request?.budgetPolicyCheck || "Policy check pending."}</p>
        </article>
        {selectedPlan ? (
          <article className="ops-card detail-card">
            <div className="card-title-row"><h2>{selectedPlan.name}</h2><StatusPill value={selectedPlan.policyFit || "Needs Review"} /></div>
            <h2>Flight Segment</h2>
            <p>{selectedPlan.flightSummary}</p>
            <h2>Hotel Segment</h2>
            <p>{selectedPlan.hotelSummary}</p>
            <h2>Transfer / Requests</h2>
            <p>{request?.specialRequests || request?.missingInformation || "No transfer or special requests recorded."}</p>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={() => void optimizeItinerary()}><Sparkles size={16} /> Optimize With AI</button>
              <button className="secondary-button" type="button" onClick={() => void finalizeSelectedItinerary()}><CheckCircle2 size={16} /> Finalize Selected Itinerary</button>
            </div>
            <StatusPill value={request?.status || "planning"} />
          </article>
        ) : null}
        {manualSourcingRequired ? (
          <article className="ops-card detail-card">
            <div className="card-title-row"><h2><AlertTriangle size={18} /> Manual Sourcing Required</h2><StatusPill value="Needs Review" /></div>
            <p>Do not finalize until an agent attaches verified travel options.</p>
          </article>
        ) : null}
        {plans.length ? plans.map((plan) => (
          <article className="ops-card plan-card" key={plan.id}>
            <div className="plan-card-head"><h2>{plan.name}</h2><StatusPill value={plan.policyFit || "Needs Review"} /></div>
            <p>{plan.flightSummary}</p>
            <p>{plan.hotelSummary}</p>
            <strong>{formatMoney(plan.totalAmount, plan.currency)}</strong>
            <button className="secondary-button" type="button" onClick={() => void selectPlan(plan.id)}>Select {plan.name}</button>
          </article>
        )) : (
          <article className="ops-card detail-card"><h2>No travel options loaded</h2><p>Generate a plan from the request workspace before finalizing.</p></article>
        )}
        {statusMessage ? <p role="status">{statusMessage}</p> : null}
      </section>
    </AppShell>
  );
}

export function TravelerRosterScreen() {
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [reviewItems, setReviewItems] = useState<RosterReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [documentIssuesOnly, setDocumentIssuesOnly] = useState(false);
  const [vipOnly, setVipOnly] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");
  const [workingReviewId, setWorkingReviewId] = useState<string | null>(null);

  useEffect(() => {
    ensureTravelSession()
      .then(() => listTravelers())
      .then((items) => {
        setTravelers(items);
        setReviewItems((current) => pendingRosterReviewItems(current.length ? current : INITIAL_ROSTER_REVIEW_ITEMS, items));
      })
      .catch(() => setTravelers([]))
      .finally(() => setReviewLoading(false));
  }, []);

  const filteredTravelers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return travelers.filter((traveler) => {
      const hasDocumentIssue = traveler.status !== "Compliant" || traveler.documents.some((document) => document.status !== "Ready");
      if (documentIssuesOnly && !hasDocumentIssue) return false;
      if (vipOnly && !traveler.vip_level) return false;
      if (!query) return true;
      const programs = traveler.loyalty_programs.map((program) => program.provider).join(" ");
      return [
        traveler.name,
        traveler.email,
        traveler.company,
        traveler.status,
        programs
      ].join(" ").toLowerCase().includes(query);
    });
  }, [documentIssuesOnly, searchTerm, travelers, vipOnly]);

  async function approveReviewItem(item: RosterReviewItem) {
    const nextTraveler = travelerFromReviewItem(item);
    const existing = travelers.find((traveler) => traveler.email.toLowerCase() === item.travelerEmail.toLowerCase());
    const profileToSave = existing ? { ...existing, ...nextTraveler, id: existing.id, created_at: existing.created_at } : nextTraveler;
    setWorkingReviewId(item.id);
    setReviewStatus("");
    try {
      const savedTraveler = await saveTravelerProfile(profileToSave);
      setTravelers((current) => {
        const found = current.some((traveler) => traveler.id === savedTraveler.id);
        return found
          ? current.map((traveler) => traveler.id === savedTraveler.id ? savedTraveler : traveler)
          : [savedTraveler, ...current];
      });
      setReviewItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setReviewStatus(`${item.travelerName} ${item.kind === "registration" ? "added to" : "updated in"} the traveler roster.`);
    } catch {
      setReviewStatus(`${item.travelerName} could not be saved to the traveler roster. Please try again.`);
    } finally {
      setWorkingReviewId(null);
    }
  }

  function rejectReviewItem(item: RosterReviewItem) {
    setReviewItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setReviewStatus(`${item.travelerName} review request dismissed.`);
  }

  return (
    <AppShell active="travelers" notificationCount={reviewLoading ? undefined : reviewItems.length}>
      <>
      <section className="page-heading">
        <div>
          <h1>Traveler Roster</h1>
          <p>Review registration and profile update forms before trusted traveler data is added to the roster.</p>
        </div>
      </section>
      <section className="ops-card roster-review-card" id="roster-review-queue" aria-label="Roster review queue">
        <div className="card-title-row">
          <h2>Roster Review</h2>
          <StatusPill value={reviewLoading ? "Loading" : `${reviewItems.length} Pending`} />
        </div>
        <p className="muted-copy">Submitted forms are classified before they update long-term traveler data. The agent reviews each registration or update before the roster changes.</p>
        <div className="roster-review-grid">
          {reviewLoading ? <div className="empty-panel">Loading roster review.</div> : reviewItems.length ? reviewItems.map((item) => (
            <article className="roster-review-item" key={item.id}>
              <div>
                <StatusPill value={item.kind === "registration" ? "New Registration" : "Profile Update"} />
                <h3>{item.travelerName}</h3>
                <p>{item.travelerEmail}</p>
              </div>
              <p>{item.summary}</p>
              <ul>
                {item.extractedFields.map((field) => <li key={field}>{field}</li>)}
              </ul>
              <div className="review-actions">
                <button className="secondary-button" type="button" onClick={() => rejectReviewItem(item)} disabled={workingReviewId === item.id}>Reject</button>
                <button className="primary-button" type="button" onClick={() => approveReviewItem(item)} disabled={workingReviewId === item.id}>
                  <CheckCircle2 size={16} /> {workingReviewId === item.id ? "Saving" : "Approve"}
                </button>
              </div>
            </article>
          )) : <div className="empty-panel">No registration or profile update forms are waiting for review.</div>}
        </div>
        {reviewStatus ? <p className="form-status" role="status">{reviewStatus}</p> : null}
      </section>
      <section className="ops-card table-card">
        <label className="topbar-control">
          <Search size={16} />
          <span>Search travelers</span>
          <input aria-label="Search travelers" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Name, company, status" />
        </label>
        <label className="topbar-control">
          <input aria-label="Document issues only" checked={documentIssuesOnly} onChange={(event) => setDocumentIssuesOnly(event.target.checked)} type="checkbox" />
          <span>Document issues only</span>
        </label>
        <label className="topbar-control">
          <input aria-label="VIP travelers only" checked={vipOnly} onChange={(event) => setVipOnly(event.target.checked)} type="checkbox" />
          <span>VIP travelers only</span>
        </label>
        <div className="request-table">
          <div className="request-table-head"><span>Traveler</span><span>Company</span><span>Status</span><span>Programs</span></div>
          {filteredTravelers.map((traveler) => (
            <Link className="request-table-row" href={`/travelers/${traveler.id}`} key={traveler.id}>
              <span>{traveler.name}<small>{traveler.email}</small></span>
              <span>{traveler.company}</span>
              <StatusPill value={traveler.status} />
              <span>{traveler.loyalty_programs.map((program) => program.provider).join(", ") || "None linked"}</span>
            </Link>
          ))}
        </div>
      </section>
      </>
    </AppShell>
  );
}

export function TravelerDossierScreen({ travelerId }: { travelerId: string }) {
  const [traveler, setTraveler] = useState<TravelerProfile | null>(null);
  const [requests, setRequests] = useState<CorporateTravelRequest[]>([]);
  const [notification, setNotification] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    ensureTravelSession()
      .then(() => Promise.all([
        getTraveler(travelerId).catch(() => null),
        listCorporateRequests().catch(() => [])
      ]))
      .then(([nextTraveler, nextRequests]) => {
        setTraveler(nextTraveler);
        setRequests(nextRequests);
      })
      .catch(() => {
        setTraveler(null);
        setRequests([]);
      });
  }, [travelerId]);

  const linkedRequest = useMemo(() => {
    const email = traveler?.email.toLowerCase();
    if (!email) return null;
    return requests.find((request) => request.travellerEmail.toLowerCase() === email) || null;
  }, [requests, traveler]);

  async function sendDocumentUpdateEmail() {
    if (!traveler || !linkedRequest) {
      setNotification("Document update email requires a linked travel request.");
      return;
    }
    setSendingNotification(true);
    setNotification("Sending document update email...");
    try {
      const result = await sendCorporateRequestNotification(linkedRequest.id, {
        kind: "document_update",
        to: [traveler.email],
        note: "Please update missing or expiring travel documents before itinerary finalization.",
        attach_itinerary: false
      });
      setNotification(result.safe_message);
    } catch {
      setNotification("Document update email could not be sent. Continue with manual follow-up.");
    } finally {
      setSendingNotification(false);
    }
  }

  return (
    <AppShell active="travelers">
      <section className="page-heading">
        <div>
          <h1>Traveler Dossier</h1>
          <p>{traveler ? `${traveler.name} • ${traveler.company}` : "Traveler profile loading"}</p>
        </div>
      </section>
      <section className="workspace-grid">
        <article className="ops-card detail-card"><h2>Travel Preferences</h2><p>Seat: {traveler?.seat_preference || "Not set"}</p><p>Meal: {traveler?.meal_preference || "Not set"}</p><p>Hotel: {traveler?.hotel_preference || "Not set"}</p></article>
        <article className="ops-card detail-card">
          <h2>Loyalty Programs</h2>
          {traveler?.loyalty_programs.length ? traveler.loyalty_programs.map((program) => (
            <p key={`${program.provider}-${program.tier}`}><strong>{program.provider}</strong> {program.tier}</p>
          )) : <p>No loyalty programs linked</p>}
        </article>
        <article className="ops-card detail-card">
          <h2>Travel Documents</h2>
          {traveler?.documents.map((doc) => (
            <p key={doc.label}>
              <strong>{doc.label}</strong> {doc.status}{doc.redacted_value ? ` · ${doc.redacted_value}` : ""}
            </p>
          )) || <p>No documents loaded</p>}
          <button className="secondary-button" type="button" onClick={() => void sendDocumentUpdateEmail()} disabled={sendingNotification || !traveler}><Send size={16} /> Send Document Update</button>
          {notification ? <p role="status">{notification}</p> : null}
        </article>
        <article className="ops-card detail-card"><h2>Policy Guard</h2>{traveler?.policy_notes.map((note) => <p key={note}>{note}</p>) || <p>No policy exceptions loaded</p>}</article>
        <article className="ops-card detail-card">
          <h2>Recent Trips</h2>
          {traveler?.recent_trips.length ? traveler.recent_trips.map((trip) => <p key={trip}>{trip}</p>) : <p>No recent trips loaded</p>}
        </article>
      </section>
    </AppShell>
  );
}

export function PolicyCenterScreen({ policyId }: { policyId?: string }) {
  const [policies, setPolicies] = useState<PolicyGroup[]>([]);
  const [selected, setSelected] = useState<PolicyGroup | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPolicies() {
      await ensureTravelSession();
      const [items, detail] = await Promise.all([
        listPolicies().catch(() => []),
        policyId ? getPolicy(policyId).catch(() => null) : Promise.resolve(null)
      ]);
      if (!active) return;
      const merged = detail
        ? items.some((item) => item.id === detail.id)
          ? items.map((item) => item.id === detail.id ? detail : item)
          : [detail, ...items]
        : items;
      setPolicies(merged);
      setSelected(policyId ? detail || merged.find((item) => item.id === policyId) || null : merged[0] || null);
    }
    void loadPolicies();
    return () => {
      active = false;
    };
  }, [policyId]);

  return (
    <AppShell active="policy">
      <section className="page-heading">
        <div><h1>Policy Context</h1><p>Check travel rules, flag exceptions, and keep agent notes ready before booking.</p></div>
        <Link className="primary-button" href="/policy/activity">Audit Log</Link>
      </section>
      <section className="workspace-grid">
        {policies.map((policy) => (
          <Link className="ops-card policy-card" href={`/policy/${policy.id}`} key={policy.id}>
            <h2>{policy.client_name}</h2>
            <StatusPill value={policy.status} />
            <p>{policy.active_rules.length} active rules</p>
          </Link>
        ))}
        <article className="ops-card detail-card">
          <h2>{selected?.client_name || "No policy selected"}</h2>
          {(selected?.active_rules || []).map((rule) => <p key={rule.label}><strong>{rule.label}</strong> {rule.value}</p>)}
        </article>
        <article className="ops-card detail-card">
          <h2>Upload Context</h2>
          <p>Policy documents</p>
          <p>Traveler history</p>
          <p>Visa and passport rules</p>
        </article>
        <article className="ops-card detail-card">
          <h2>Extracted Rules</h2>
          <p>{selected ? `${selected.active_rules.length} active rules extracted` : "No active rules extracted"}</p>
          <p>{selected ? `Compliance score ${Math.round(selected.compliance_score)}%` : "Compliance score unavailable"}</p>
        </article>
      </section>
    </AppShell>
  );
}

export function PolicyReviewScreen({ policyId }: { policyId: string }) {
  const [versions, setVersions] = useState<PolicyRevision[]>([]);
  const [policy, setPolicy] = useState<PolicyGroup | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [reviewComment, setReviewComment] = useState("");

  useEffect(() => {
    ensureTravelSession()
      .then(() => Promise.all([
        listPolicyVersions(policyId).catch(() => []),
        getPolicy(policyId).catch(() => null)
      ]))
      .then(([nextVersions, nextPolicy]) => {
        setVersions(nextVersions);
        setPolicy(nextPolicy);
      })
      .catch(() => {
        setVersions([]);
        setPolicy(null);
      });
  }, [policyId]);

  const revision = versions[0] || null;
  const activeRuleByLabel = new Map((policy?.active_rules || []).map((rule) => [rule.label, rule]));

  async function approveRevision() {
    if (!revision) return;
    try {
      await approvePolicyRevision(policyId, revision.id, reviewComment.trim() || "Approved from review dashboard.");
      setVersions((current) => current.map((item) => item.id === revision.id ? { ...item, status: "Approved" } : item));
      setStatusMessage("Policy revision approved.");
    } catch {
      setStatusMessage("Policy revision could not be approved. Continue with manual review.");
    }
  }

  async function requestChanges() {
    if (!revision) return;
    try {
      await requestPolicyRevisionChanges(policyId, revision.id, reviewComment.trim() || "Changes requested from review dashboard.");
      setVersions((current) => current.map((item) => item.id === revision.id ? { ...item, status: "Changes Requested" } : item));
      setStatusMessage("Policy revision changes requested.");
    } catch {
      setStatusMessage("Policy revision changes could not be requested. Continue with manual review.");
    }
  }

  return (
    <AppShell active="policy">
      <section className="page-heading">
        <div><h1>Policy Review Dashboard</h1><p>Compare proposed rules, review impact, and approve or request changes.</p></div>
      </section>
      <section className="workspace-grid">
        <article className="ops-card detail-card">
          <h2>Revision Lifecycle</h2>
          <StatusPill value={revision?.status || "In Review"} />
          <p>{revision?.summary || "No active revision loaded."}</p>
          <label>
            <span>Reviewer comment</span>
            <textarea aria-label="Reviewer comment" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} />
          </label>
          <div className="detail-actions">
            <button className="primary-button" type="button" onClick={() => void approveRevision()} disabled={!revision}><CheckCircle2 size={16} /> Approve Revision</button>
            <button className="secondary-button" type="button" onClick={() => void requestChanges()} disabled={!revision}><MessageSquare size={16} /> Request Changes</button>
          </div>
          {statusMessage ? <p role="status">{statusMessage}</p> : null}
        </article>
        <article className="ops-card detail-card"><h2>Proposed Rules</h2>{revision?.proposed_rules.map((rule) => <p key={rule.label}><strong>{rule.label}</strong> {rule.value}</p>) || <p>No proposed rules</p>}</article>
        <article className="ops-card detail-card">
          <h2>Version Comparison</h2>
          {revision?.proposed_rules.length ? revision.proposed_rules.map((rule) => {
            const activeRule = activeRuleByLabel.get(rule.label);
            return (
              <div className="detail-info-card" key={rule.label}>
                <strong>{rule.label}</strong>
                <span>Current: {activeRule?.value || "No active rule"}</span>
                <span>Proposed: {rule.value}</span>
                <StatusPill value={rule.status} />
              </div>
            );
          }) : <p>No proposed rules to compare.</p>}
        </article>
        <article className="ops-card detail-card"><h2>Reviewer Comments</h2>{revision?.reviewer_comments.length ? revision.reviewer_comments.map((comment) => <p key={comment}>{comment}</p>) : <p>No reviewer comments yet.</p>}</article>
        <article className="ops-card detail-card"><h2>AI Impact Analysis</h2><p>{revision?.impact_analysis || "Impact analysis pending."}</p></article>
      </section>
    </AppShell>
  );
}

export function PolicyActivityArchiveScreen() {
  const [events, setEvents] = useState<PolicyActivityEvent[]>([]);

  useEffect(() => {
    ensureTravelSession()
      .then(() => listPolicyActivity())
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  function exportCsv() {
    const rows = [
      ["Timestamp", "Actor", "Activity", "Status"],
      ...events.map((event) => [event.created_at, event.actor, event.activity, event.status])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "policy-activity.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell active="policy">
      <section className="page-heading">
        <div><h1>Policy Activity Archive</h1><p>Complete audit trail of policy modifications and agent interactions.</p></div>
        <button className="secondary-button" type="button" onClick={exportCsv}><Download size={16} /> Export CSV</button>
      </section>
      <section className="ops-card table-card">
        <div className="request-table">
          <div className="request-table-head"><span>Timestamp</span><span>Actor</span><span>Activity</span><span>Status</span></div>
          {events.map((event) => (
            <div className="request-table-row" key={event.id}><span>{formatUpdated(event.created_at)}</span><span>{event.actor}</span><span>{event.activity}</span><StatusPill value={event.status} /></div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function AuditArchiveScreen() {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [emailEvents, setEmailEvents] = useState<EmailEvent[]>([]);
  const auth = useTravelAuth();
  const canView = Boolean(auth?.scopes.some((scope) => scope === "travel:plan" || scope === "admin:audit" || scope === "admin:summary"));

  useEffect(() => {
    if (!canView) return;
    let mounted = true;
    ensureTravelSession()
      .then(() => Promise.all([
        getAuditEvents().catch(() => []),
        getEmailEvents().catch(() => [])
      ]))
      .then(([nextAuditEvents, nextEmailEvents]) => {
        if (!mounted) return;
        setAuditEvents(nextAuditEvents);
        setEmailEvents(nextEmailEvents);
      })
      .catch(() => {
        if (!mounted) return;
        setAuditEvents([]);
        setEmailEvents([]);
      });
    return () => {
      mounted = false;
    };
  }, [canView]);

  const emailCounts = useMemo(() => ({
    sent: emailEvents.filter((event) => event.status === "sent").length,
    received: emailEvents.filter((event) => event.status === "received").length,
    attention: emailEvents.filter((event) => event.status === "failed" || event.status === "configuration_required").length
  }), [emailEvents]);
  const auditGroups = useMemo(() => AUDIT_GROUPS.map((group) => ({
    ...group,
    events: auditEvents.filter((event) => auditGroupFor(event) === group.key)
  })), [auditEvents]);

  if (!canView) {
    return (
      <AppShell active="audit">
        <section className="ops-card access-card">
          <ShieldCheck size={28} />
          <h1>Audit access is restricted.</h1>
          <Link className="primary-button" href="/dashboard">Open Agent Workspace</Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active="audit">
      <section className="page-heading">
        <div><h1>Audit</h1><p>Pipeline, approval, and delivery evidence.</p></div>
      </section>

      <section className="admin-metric-grid">
        <article className="metric-card"><Plane size={18} /><span>Pipeline Logs</span><strong>{auditGroups.find((group) => group.key === "pipeline")?.events.length || 0}</strong></article>
        <article className="metric-card"><Send size={18} /><span>Sent Emails</span><strong>{emailCounts.sent}</strong></article>
        <article className="metric-card"><Download size={18} /><span>Received Emails</span><strong>{emailCounts.received}</strong></article>
        <article className="metric-card"><AlertTriangle size={18} /><span>Email Attention</span><strong>{emailCounts.attention}</strong></article>
      </section>

      {auditGroups.map(({ key, label, icon: Icon, events }) => (
        <section className="ops-card table-card" key={key}>
          <div className="card-title-row">
            <h2>{label}</h2>
            <Icon size={18} />
          </div>
          <div className="request-table">
            <div className="request-table-head"><span>Event</span><span>Decision</span><span>Message</span><span>Time</span></div>
            {events.length ? events.map((event) => (
              <div className="request-table-row" key={event.id}>
                <span>{event.event_type}<small>{event.trip_id || "No request linked"}</small></span>
                <StatusPill value={event.decision || "record"} />
                <span>{event.message}<small>{event.purpose || "No purpose recorded"}</small></span>
                <span>{formatUpdated(event.created_at)}</span>
              </div>
            )) : (
              <div className="request-table-row"><span>No logs loaded</span><StatusPill value="record" /><span>No activity in this category.</span><span>Now</span></div>
            )}
          </div>
        </section>
      ))}

      <section className="ops-card table-card">
        <div className="card-title-row">
          <h2>Email Itinerary</h2>
          <Send size={18} />
        </div>
        <div className="request-table">
          <div className="request-table-head"><span>Type</span><span>Status</span><span>Subject</span><span>Email Content</span></div>
          {emailEvents.length ? emailEvents.map((event) => (
            <div className="request-table-row" key={event.id}>
              <span>{event.kind || "received"}<small>{event.request_id || "No request linked"}</small></span>
              <span><StatusPill value={event.status} /><small>{event.provider_message_id || event.provider}</small></span>
              <span>{event.subject || "No subject"}<small>{event.to.length ? event.to.join(", ") : "No recipients recorded"}</small></span>
              <div>
                <details>
                  <summary>View email itinerary</summary>
                  <p>{event.safe_message}</p>
                  {event.body_text ? <pre>{event.body_text}</pre> : <p>No email body captured for this event.</p>}
                  {event.attachment_names?.length ? <small>Attachments: {event.attachment_names.join(", ")}</small> : <small>No attachments recorded</small>}
                </details>
                <small>{formatUpdated(event.created_at)}</small>
              </div>
            </div>
          )) : (
            <div className="request-table-row"><span>No email logs loaded</span><StatusPill value="record" /><span>Delivery events will appear here.</span><span>Now</span></div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function csvCell(value: string) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

type AuditGroupKey = "pipeline" | "requests" | "travelerPolicy" | "system";

const AUDIT_GROUPS: Array<{ key: AuditGroupKey; label: string; icon: LucideIcon }> = [
  { key: "pipeline", label: "Pipeline And Itineraries", icon: Plane },
  { key: "requests", label: "Request Queue", icon: FileText },
  { key: "travelerPolicy", label: "Traveler And Policy", icon: ShieldCheck },
  { key: "system", label: "System Access", icon: History }
];

function auditGroupFor(event: AuditEvent): AuditGroupKey {
  const type = event.event_type;
  if (
    type.includes("pipeline")
    || type.includes("option_pdf")
    || type.includes("notification")
    || type === "corporate.plan.allowed"
    || type === "corporate.finalize.allowed"
  ) {
    return "pipeline";
  }
  if (type.startsWith("corporate.request")) return "requests";
  if (type.startsWith("traveler") || type.startsWith("polic")) return "travelerPolicy";
  return "system";
}

export function AdminDashboard() {
  const [summary, setSummary] = useState<CorporateAdminSummary>(() => summaryFromRequests([]));
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [companies, setCompanies] = useState<CompanyPipelineStatus[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<CorporateUploadResponse | null>(null);
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policyCompanyName, setPolicyCompanyName] = useState("");
  const [policyResult, setPolicyResult] = useState<CompanyPolicyImportResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [policyStatus, setPolicyStatus] = useState<"idle" | "uploading">("idle");
  const role = useSelectedRole();
  const auth = useTravelAuth();
  const canView = isAdminContext(auth, role);

  useEffect(() => {
    if (!canView) return;
    let mounted = true;
    getCorporateAdminSummary()
      .then((next) => {
        if (mounted) setSummary(next);
      })
      .catch(() => {
        if (mounted) setSummary(summaryFromRequests([]));
      });
    getAuditEvents()
      .then((events) => {
        if (mounted) setAuditEvents(events.slice(0, 5));
      })
      .catch(() => {
        if (mounted) setAuditEvents([]);
      });
    listCompanyPipelineStatuses()
      .then((items) => {
        if (mounted) setCompanies(items);
      })
      .catch(() => {
        if (mounted) setCompanies([]);
      });
    return () => {
      mounted = false;
    };
  }, [canView]);

  const metricCards = useMemo(() => [
    { label: "Total Requests", value: String(summary.totalRequests), icon: FileText },
    { label: "New", value: String(summary.newRequests), icon: Plus },
    { label: "Pending Approvals", value: String(summary.pendingApprovals), icon: Clock3 },
    { label: "Missing Info", value: String(summary.missingInfo), icon: AlertTriangle },
    { label: "Visa Issues", value: String(summary.visaIssues), icon: IdCard },
    { label: "Finalized Itineraries", value: String(summary.finalizedItineraries), icon: ClipboardCheck },
    { label: "Average Handling Time", value: `${summary.averageHandlingTimeHours}h`, icon: CalendarDays }
  ], [summary]);

  async function uploadFileToBackend() {
    if (!uploadFile || status === "uploading") return;
    setStatus("uploading");
    try {
      const result = await uploadCorporateRequests(uploadFile);
      setUploadResult(result);
      setCompanies(await listCompanyPipelineStatuses().catch(() => []));
    } catch {
      setUploadResult({ totalRows: 0, createdRequests: 0, skippedRows: 0, employeeProfiles: 0, requests: [] });
    } finally {
      setStatus("idle");
    }
  }

  async function uploadPolicyPdfToBackend() {
    if (!policyFile || policyStatus === "uploading") return;
    setPolicyStatus("uploading");
    try {
      const result = await uploadCompanyPolicyPdf(policyFile, policyCompanyName.trim() || undefined);
      setPolicyResult(result);
      setCompanies(await listCompanyPipelineStatuses().catch(() => []));
      setPolicyFile(null);
    } catch {
      setPolicyResult({ companyName: policyCompanyName || "Company pending", policyCount: 0, rules: [] });
    } finally {
      setPolicyStatus("idle");
    }
  }

  async function downloadTemplate() {
    try {
      const blob = await downloadCorporateExcelTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "corporate_travel_company_profile_template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setUploadResult({ totalRows: 0, createdRequests: 0, skippedRows: 0, employeeProfiles: 0, requests: [] });
    }
  }

  if (!canView) {
    return (
      <AppShell active="admin">
        <section className="ops-card access-card">
          <ShieldCheck size={28} />
          <h1>Admin access is restricted.</h1>
          <Link className="primary-button" href="/dashboard">Open Agent Workspace</Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active="admin">
      <section className="page-heading">
        <div>
          <h1>Application Admin</h1>
          <p>Upload company traveler history, preferences, policy, approvals, and document context for the agent workspace.</p>
        </div>
      </section>

      <section className="admin-metric-grid">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <article className="metric-card" key={label}>
            <Icon size={18} />
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-two-column">
        <section className="ops-card upload-card">
          <div className="card-title-row">
            <h2>Import Company Data</h2>
            <FileSpreadsheet size={18} />
          </div>
          <p className="muted-copy">Upload the band-based traveler workbook with traveler profiles, company policy, preferences, visa/passport records, hotel insights, flight preferences, and past travel history.</p>
          <button className="secondary-button" type="button" onClick={() => void downloadTemplate()}>
            <Download size={16} /> Download Template
          </button>
          <label className="file-input">
            <Upload size={18} />
            <span>{uploadFile ? uploadFile.name : "Select Excel file"}</span>
            <input type="file" accept=".xlsx" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
          </label>
          <button className="primary-button" type="button" disabled={!uploadFile || status === "uploading"} onClick={() => void uploadFileToBackend()}>
            {status === "uploading" ? "Uploading..." : "Import Workbook"}
          </button>
          {uploadResult ? (
            <div className="upload-result" role="status">
              <p><strong>{uploadResult.totalRows}</strong> rows processed</p>
              <p><strong>{uploadResult.employeeProfiles}</strong> employee profiles imported</p>
              <p>{uploadResult.skippedRows} skipped</p>
              {uploadResult.requests.map((request) => <span key={request.id}>{request.id}</span>)}
            </div>
          ) : null}
        </section>
        <section className="ops-card upload-card">
          <div className="card-title-row">
            <h2>Import Company Policy PDF</h2>
            <FileText size={18} />
          </div>
          <p className="muted-copy">Upload a policy PDF for the selected company. The agent AI uses it with the traveler roster when generating or recovering itineraries.</p>
          <label>
            <span>Company name</span>
            <input value={policyCompanyName} onChange={(event) => setPolicyCompanyName(event.target.value)} placeholder="Company name from workbook" />
          </label>
          <label className="file-input">
            <Upload size={18} />
            <span>{policyFile ? policyFile.name : "Select policy PDF"}</span>
            <input aria-label="Select policy PDF" type="file" accept=".pdf,application/pdf" onChange={(event) => setPolicyFile(event.target.files?.[0] || null)} />
          </label>
          <button className="primary-button" type="button" disabled={!policyFile || policyStatus === "uploading"} onClick={() => void uploadPolicyPdfToBackend()}>
            {policyStatus === "uploading" ? "Uploading..." : "Import Policy PDF"}
          </button>
          {policyResult ? (
            <div className="upload-result" role="status">
              <p><strong>{policyResult.policyCount}</strong> policy file imported for {policyResult.companyName}</p>
              <p>{policyResult.rules[0] || "Policy PDF processed for AI context."}</p>
            </div>
          ) : null}
        </section>
      </section>

      <section className="ops-card company-pipeline-card">
        <div className="card-title-row">
          <h2>Company Pipeline</h2>
          <Building2 size={18} />
        </div>
        <div className="company-pipeline-grid">
          {companies.length ? companies.map((company) => (
            <article className="company-pipeline-item" key={company.companyName}>
              <div className="company-pipeline-head">
                <strong>{company.companyName}</strong>
                <StatusPill value={company.policyStatus === "Uploaded" && company.travelerListStatus === "Updated" ? "Ready" : "Missing context"} />
              </div>
              <div className="company-pipeline-statuses">
                <span><UsersIcon size={15} /> Travelers <strong>{company.travelerListStatus}</strong></span>
                <span><FileText size={15} /> Policy <strong>{company.policyStatus}</strong></span>
              </div>
              <dl>
                <div><dt>Travelers</dt><dd>{company.travelerCount}</dd></div>
                <div><dt>History rows</dt><dd>{company.historyRowCount}</dd></div>
                <div><dt>Visa records</dt><dd>{company.visaRecordCount}</dd></div>
                <div><dt>Policy PDFs</dt><dd>{company.policyCount}</dd></div>
              </dl>
            </article>
          )) : (
            <div className="empty-panel">No company context uploaded yet.</div>
          )}
        </div>
      </section>

      <section className="ops-card destinations-card">
        <div className="card-title-row">
          <h2>Common Destinations</h2>
          <Building2 size={18} />
        </div>
        <div className="destination-list">
          {summary.commonDestinations.length ? summary.commonDestinations.map((item) => (
            <p key={item.destination}><span>{item.destination}</span><strong>{item.count}</strong></p>
          )) : <p><span>No destination data yet</span><strong>0</strong></p>}
        </div>
      </section>

      <section className="ops-card table-card">
        <div className="card-title-row">
          <h2>Recent Audit Activity</h2>
          <History size={18} />
        </div>
        <div className="request-table">
          <div className="request-table-head"><span>Event</span><span>Decision</span><span>Message</span><span>Time</span></div>
          {auditEvents.length ? auditEvents.map((event) => (
            <div className="request-table-row" key={event.id}>
              <span>{event.event_type}</span>
              <StatusPill value={event.decision || "record"} />
              <span>{event.message}</span>
              <span>{formatUpdated(event.created_at)}</span>
            </div>
          )) : (
            <div className="request-table-row"><span>No audit events loaded</span><span>record</span><span>Operational activity will appear here.</span><span>Now</span></div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
