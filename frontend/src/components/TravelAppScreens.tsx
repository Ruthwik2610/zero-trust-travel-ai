"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Expand,
  FileSpreadsheet,
  FileText,
  History,
  IdCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  MoreVertical,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
  User,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  createCorporateRequest,
  demoLogin,
  downloadCorporateExcelTemplate,
  downloadCorporateRequestExcel,
  finalizeCorporateRequest,
  generateCorporateTravelPlan,
  getCorporateAdminSummary,
  getStoredAuthContext,
  getPolicy,
  getTraveler,
  listCorporateRequests,
  listPolicies,
  listPolicyActivity,
  listPolicyVersions,
  listTravelers,
  sendCorporateRequestNotification,
  storeAuthSession,
  updateCorporateRequest,
  uploadCorporateRequests
} from "@/lib/api";
import type {
  AuthContext,
  CorporateAdminSummary,
  CorporateCreateRequest,
  CorporatePlanOption,
  CorporateRole,
  CorporateTravelRequest,
  CorporateUploadResponse,
  PolicyActivityEvent,
  PolicyGroup,
  PolicyRevision,
  TravelerProfile
} from "@/lib/types";

type TravelChatLine = {
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_EMAIL = "demo.agent@unipro.com";
const DEFAULT_PASSWORD = "travel-demo-2026";
const SELECTED_ROLE_KEY = "travel_ai_selected_role";
const USER_EMAIL_KEY = "travel_ai_user_email";

const ROLE_ACCOUNTS: Record<CorporateRole, { label: string; email: string; description: string; path: string; icon: LucideIcon }> = {
  admin: {
    label: "Application Admin",
    email: "admin.user@unipro.com",
    description: "Manage company policy, client data, and operations reporting.",
    path: "/admin",
    icon: ShieldCheck
  },
  agent: {
    label: "Travel Agent",
    email: "demo.agent@unipro.com",
    description: "Create requests, generate AI plans, review, finalize, and export.",
    path: "/dashboard",
    icon: Plane
  }
};

const EMPTY_FORM: CorporateCreateRequest = {
  travellerName: "",
  travellerEmail: "",
  company: "",
  origin: "",
  destination: "",
  departDate: "",
  returnDate: "",
  purpose: "",
  preferences: "",
  budgetAmount: 150000,
  budgetCurrency: "INR",
  specialRequests: ""
};

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
  const session = await demoLogin(email.trim() || DEFAULT_EMAIL);
  storeAuthSession(session);
  return session.user;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "INR" || currency === "JPY" ? 0 : 2
  }).format(amount || 0);
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

function initialsFor(value: string) {
  return value
    .split(/[.@\s_-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "UA";
}

function summaryFromRequests(requests: CorporateTravelRequest[]): CorporateAdminSummary {
  const destinationCounts = requests.reduce<Record<string, number>>((counts, request) => {
    counts[request.destination] = (counts[request.destination] || 0) + 1;
    return counts;
  }, {});
  return {
    totalRequests: requests.length,
    newRequests: requests.filter((request) => request.status === "new").length,
    pendingApprovals: requests.filter((request) => request.approvalStatus === "Required").length,
    missingInfo: requests.filter((request) => request.status === "missing_info").length,
    visaIssues: requests.filter((request) => request.visaStatus !== "clear").length,
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

type BoardColumn = {
  key: string;
  title: string;
  description: string;
  requests: CorporateTravelRequest[];
};

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

function priorityFor(request: CorporateTravelRequest): "High" | "Medium" | "Low" {
  if (
    request.status === "missing_info"
    || request.visaStatus === "blocked"
    || request.visaStatus === "pending"
    || request.budgetStatus === "blocked"
    || request.approvalStatus === "Required"
  ) {
    return "High";
  }
  if (request.status === "new" || request.status === "planning" || request.budgetStatus === "attention") {
    return "Medium";
  }
  return "Low";
}

function priorityReasons(request: CorporateTravelRequest) {
  const reasons: string[] = [];
  if (request.status === "missing_info" || request.missingInformation) reasons.push("Missing info");
  if (request.visaStatus === "blocked" || request.visaStatus === "pending") reasons.push("Visa issue");
  if (request.budgetStatus === "blocked" || request.budgetStatus === "attention") reasons.push("Over budget");
  if (request.approvalStatus === "Required") reasons.push("Approval needed");
  return reasons.length ? reasons : ["Ready"];
}

function nextActionFor(request: CorporateTravelRequest) {
  if (request.status === "missing_info") return "Ask for info";
  if (request.status === "new") return "Generate plan";
  if (request.status === "planning") return "Review plan";
  if (request.status === "pending_approval" || request.approvalStatus === "Required") return "Track approval";
  if (!request.finalApproved) return "Finalize itinerary";
  if (request.missingInformation) return "Ask for info";
  return "Completed";
}

function boardStageFor(request: CorporateTravelRequest) {
  if (request.status === "missing_info") return "waiting_info";
  if (request.status !== "finalized" && request.approvalStatus === "Received" && !request.finalApproved) return "ready_finalize";
  if (request.status === "new") return "ready_plan";
  if (request.status === "planning") return "in_process";
  if (request.status === "pending_approval" || request.approvalStatus === "Required") return "waiting_approval";
  if (request.status === "finalized") return "completed";
  return "in_process";
}

function boardColumnsFor(requests: CorporateTravelRequest[]): BoardColumn[] {
  const columns = [
    { key: "waiting_info", title: "Waiting For Information", description: "Blocked until client or traveler details arrive." },
    { key: "ready_plan", title: "Ready To Plan", description: "Complete enough for provider search and plan generation." },
    { key: "in_process", title: "In Process", description: "Being planned, reviewed, or edited by an agent." },
    { key: "waiting_approval", title: "Waiting For Approval", description: "Plan exists and approval is still required." },
    { key: "ready_finalize", title: "Ready To Finalize", description: "Reviewed work waiting for itinerary export." },
    { key: "completed", title: "Completed", description: "Final itinerary and export are complete." },
  ];
  return columns.map((column) => ({
    ...column,
    requests: requests.filter((request) => {
      return boardStageFor(request) === column.key;
    })
  }));
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
      <img src="/unipro-icon.svg" alt="Unipro" />
      <span>
        <strong>Unipro</strong>
        <small>Corporate Travel</small>
      </span>
    </span>
  );
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.replace(/[_\s]+/g, "-");
  return <span className={`status-pill ${normalized}`}>{value.replace(/_/g, " ")}</span>;
}

type AppArea = "dashboard" | "requests" | "itineraries" | "travelers" | "policy" | "admin";

function AppShell({ active, children }: { active: AppArea; children: ReactNode }) {
  const role = useSelectedRole();
  const auth = useTravelAuth();
  const [storedEmail, setStoredEmail] = useState(DEFAULT_EMAIL);
  const displayEmail = auth?.email || storedEmail;
  const adminAllowed = isAdminContext(auth, role);
  const canReadPolicy = Boolean(auth?.scopes.some((scope) => scope === "policy:read" || scope === "policy:write" || scope === "admin:summary"));
  const canReadAdmin = Boolean(auth?.scopes.includes("admin:summary"));
  const roleMeta = ROLE_ACCOUNTS[role];

  useEffect(() => {
    setStoredEmail(getStoredEmail());
  }, []);

  return (
    <main className="ops-shell">
      <aside className="ops-sidebar">
        <Link href="/dashboard" aria-label="Travel dashboard"><UniproLogo /></Link>
        <span className="sidebar-label">Roles</span>
        <nav aria-label="Travel operations navigation">
          <Link className={active === "dashboard" ? "active" : ""} href="/dashboard"><User size={18} /> Agent Operations</Link>
          <Link className={active === "requests" ? "active" : ""} href="/requests/workspace"><ClipboardCheck size={18} /> Requests</Link>
          <Link className={active === "itineraries" ? "active" : ""} href="/itineraries/builder"><Plane size={18} /> Itineraries</Link>
          <Link className={active === "travelers" ? "active" : ""} href="/travelers"><IdCard size={18} /> Travelers</Link>
          {canReadPolicy ? <Link className={active === "policy" ? "active" : ""} href="/policy"><ShieldCheck size={18} /> Policy</Link> : null}
          {canReadAdmin ? <Link className={active === "admin" ? "active" : ""} href="/admin"><BarChart3 size={18} /> Application Admin</Link> : null}
        </nav>
        <div className="sidebar-travel-image" aria-hidden="true" />
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar">{initialsFor(displayEmail)}</span>
            <div>
              <strong>{displayEmail.includes("admin") ? "Jane Smith" : "Jane Smith"}</strong>
              <span>{adminAllowed ? "Application Admin" : roleMeta.label}</span>
            </div>
          </div>
        </div>
      </aside>
      <section className="ops-main">
        <header className="ops-topbar">
          <div className="topbar-control">
            <span>Role:</span>
            <select
              aria-label="Role"
              value={role}
              onChange={(event) => {
                const next = event.target.value as CorporateRole;
                window.localStorage.setItem(SELECTED_ROLE_KEY, next);
                window.localStorage.setItem(USER_EMAIL_KEY, ROLE_ACCOUNTS[next].email);
                window.location.assign(ROLE_ACCOUNTS[next].path);
              }}
            >
              <option value="agent">Travel Agent</option>
              {canReadAdmin ? <option value="admin">Application Admin</option> : null}
            </select>
          </div>
          <ThemeToggle />
          <button className="sign-out-button" type="button"><LogOut size={16} /> Sign out</button>
        </header>
        {children}
      </section>
    </main>
  );
}

export function LoginScreen() {
  const [email, setEmail] = useState(ROLE_ACCOUNTS.agent.email);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [role, setRole] = useState<CorporateRole>("agent");
  const [status, setStatus] = useState<"idle" | "signing-in" | "error">("idle");

  function chooseRole(nextRole: CorporateRole) {
    setRole(nextRole);
    setEmail(ROLE_ACCOUNTS[nextRole].email);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (status === "signing-in") return;
    setStatus("signing-in");
    try {
      const session = await demoLogin(email.trim() || DEFAULT_EMAIL);
      storeAuthSession(session);
      window.localStorage.setItem(SELECTED_ROLE_KEY, role);
      navigateAfterLogin(ROLE_ACCOUNTS[role].path);
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-panel-header">
          <UniproLogo />
          <ThemeToggle />
        </div>
        <div className="login-title">
          <h1>Unipro Travel Operations</h1>
          <p>Corporate travel agents create requests, generate AI plans, track approval status, and finalize reviewed itineraries in one workspace.</p>
        </div>
        <div className="login-signal-grid">
          <Signal icon={Plane} label="Agent" value="Plan & finalize" />
          <Signal icon={ShieldCheck} label="Admin" value="Policy data" />
          <Signal icon={FileSpreadsheet} label="Excel" value="Import/export" />
        </div>
      </section>
      <form className="login-card" onSubmit={signIn}>
        <h2>Sign in</h2>
        <label>
          <span>Email</span>
          <input autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <span className="input-with-icon"><KeyRound size={16} /><input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></span>
        </label>
        <div className="role-card-grid" aria-label="Role">
          {(["agent", "admin"] as CorporateRole[]).map((item) => {
            const Icon = ROLE_ACCOUNTS[item].icon;
            return (
            <button className={role === item ? "active" : ""} key={item} type="button" onClick={() => chooseRole(item)}>
              <Icon size={17} />
              <strong>{ROLE_ACCOUNTS[item].label}</strong>
              <span>{ROLE_ACCOUNTS[item].description}</span>
            </button>
          )})}
        </div>
        {status === "error" ? <p className="inline-error">Sign in is unavailable. Please try again after a moment.</p> : null}
        <button className="primary-button" disabled={status === "signing-in"} type="submit">
          {status === "signing-in" ? "Signing in..." : "Sign in"}
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
  const [workspaceTab, setWorkspaceTab] = useState<"details" | "assistant">("details");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const dashboardRequests = useMemo(() => buildDashboardRequests(requests), [requests]);
  const selectedRequest = dashboardRequests.find((request) => request.id === selectedId) || dashboardRequests[0] || null;

  useEffect(() => {
    let mounted = true;
    ensureTravelSession()
      .then(() => listCorporateRequests())
      .then((items) => {
        if (!mounted) return;
        if (items.length) {
          setRequests(items);
          setSelectedId(items[0].id);
        } else {
          setRequests([]);
          setSelectedId("");
        }
        setLoadState("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setRequests([]);
        setSelectedId("");
        setLoadState("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  function replaceRequest(next: CorporateTravelRequest) {
    setRequests((current) => {
      const exists = current.some((request) => request.id === next.id);
      return exists ? current.map((request) => request.id === next.id ? next : request) : [next, ...current];
    });
    setSelectedId(next.id);
  }

  async function createRequest(payload: CorporateCreateRequest) {
    const created = await createCorporateRequest(payload);
    replaceRequest(created);
    setShowRequestForm(false);
    setWorkspaceTab("details");
  }

  return (
    <AppShell active="dashboard">
      <section className="page-heading">
        <div>
          <h1>Agent Operations Dashboard</h1>
          <p>{loadState === "loading" ? "Loading travel requests..." : "Manage travel requests, plan trips, and collaborate with AI."}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setShowRequestForm(true)}>
          <Plus size={16} /> New Request
        </button>
      </section>

      <section className="agent-operations-grid">
        <RequestQueue requests={dashboardRequests} selectedId={selectedRequest?.id || selectedId} onOpen={setSelectedId} />
        <section className="agent-workspace-tabs">
          {showRequestForm ? (
            <TravelRequestForm onCancel={() => setShowRequestForm(false)} onCreate={(payload) => void createRequest(payload)} />
          ) : (
            <>
              <div className="workspace-tabbar" aria-label="Agent workspace tabs">
                <button className={workspaceTab === "details" ? "active" : ""} type="button" onClick={() => setWorkspaceTab("details")}>
                  Request Details
                </button>
                <button className={workspaceTab === "assistant" ? "active" : ""} type="button" onClick={() => setWorkspaceTab("assistant")}>
                  AI Planning Assistant
                </button>
              </div>
              {selectedRequest ? (
                workspaceTab === "details"
                  ? <RequestDetail request={selectedRequest} onChange={replaceRequest} />
                  : <AiPlanningAssistant request={selectedRequest} />
              ) : <section className="empty-panel">{loadState === "error" ? "Request queue is unavailable." : "No live travel requests yet."}</section>}
            </>
          )}
        </section>
      </section>
    </AppShell>
  );
}

function RequestQueue({ requests, selectedId, onOpen }: { requests: CorporateTravelRequest[]; selectedId: string; onOpen: (id: string) => void }) {
  const counts = {
    new: requests.filter((request) => request.status === "new").length,
    planning: requests.filter((request) => request.status === "planning").length,
    hold: requests.filter((request) => request.status === "pending_approval" || request.status === "missing_info").length,
    complete: requests.filter((request) => request.status === "finalized").length
  };
  const columns = boardColumnsFor(requests);
  return (
    <section className="ops-card queue-card">
      <div className="card-title-row">
        <h2>Request Queue</h2>
        <div className="queue-tools">
          <select aria-label="Status filter" defaultValue="all"><option value="all">All Status</option></select>
          <button aria-label="Search" className="icon-button" type="button"><Search size={16} /></button>
          <button aria-label="Filter" className="icon-button" type="button"><SlidersHorizontal size={16} /></button>
          <button aria-label="Refresh" className="icon-button" type="button"><RefreshCw size={16} /></button>
        </div>
      </div>
      <div className="queue-tabs" aria-label="Request status tabs">
        <button className="active" type="button">All <span>{requests.length}</span></button>
        <button type="button">New <span>{counts.new}</span></button>
        <button type="button">In Progress <span>{counts.planning}</span></button>
        <button type="button">On Hold <span>{counts.hold}</span></button>
        <button type="button">Complete <span>{counts.complete}</span></button>
      </div>
      <section className="priority-board" aria-label="Priority Board">
        <div className="board-head">
          <div>
            <h2>Priority Board</h2>
            <p>Workflow stage first, priority and blockers on each request card.</p>
          </div>
          <span>{requests.length} live requests</span>
        </div>
        {requests.length ? (
          <div className="board-columns">
            {columns.map((column) => (
              <section className="board-column" key={column.key} aria-label={column.title}>
                <div className="board-column-head">
                  <h3>{column.title}</h3>
                  <span>{column.requests.length}</span>
                </div>
                <p>{column.description}</p>
                <div className="request-card-stack">
                  {column.requests.length ? column.requests.map((request) => (
                    <button
                      className={selectedId === request.id ? "request-board-card selected" : "request-board-card"}
                      key={request.id}
                      type="button"
                      onClick={() => onOpen(request.id)}
                    >
                      <span className={`priority-badge ${priorityFor(request).toLowerCase()}`}>{priorityFor(request)}</span>
                      <span className="request-card-id">{request.id}</span>
                      <strong>{request.travellerName}</strong>
                      <span>{request.company}</span>
                      <span>{routeText(request)}</span>
                      <span>{formatDate(request.departDate)} - {formatDate(request.returnDate)}</span>
                      <span className="request-card-label">Traveller</span>
                      <span className="request-card-label">Company</span>
                      <span className="request-card-label">Destination</span>
                      <span className="request-card-label">Travel dates</span>
                      <span className="request-card-label">Visa</span>
                      <span className="request-card-label">Budget</span>
                      <span className="request-card-label">Approval</span>
                      <span className="reason-chip-row">
                        {priorityReasons(request).map((reason) => <span key={reason}>{reason}</span>)}
                      </span>
                      {request.missingInformation ? <span className="blocker-note">{request.missingInformation}</span> : null}
                      <span className="card-next-action">{nextActionFor(request)}</span>
                      <span className="card-owner">Assigned to travel ops</span>
                      <span className="card-updated">{updatedAge(request.lastUpdated)}</span>
                    </button>
                  )) : <span className="empty-column">No requests</span>}
                </div>
              </section>
            ))}
          </div>
        ) : <div className="empty-panel">No live travel requests yet.</div>}
      </section>
      <div className="queue-footer">
        <span>Showing {requests.length ? 1 : 0} to {requests.length} of {requests.length} requests</span>
      </div>
    </section>
  );
}

function TravelRequestForm({
  onCancel,
  onCreate,
  title = "Travel Request Form",
  submitLabel = "Create Request",
  initialValues
}: {
  onCancel?: () => void;
  onCreate: (payload: CorporateCreateRequest) => void;
  title?: string;
  submitLabel?: string;
  initialValues?: CorporateCreateRequest;
}) {
  const [form, setForm] = useState<CorporateCreateRequest>({
    ...EMPTY_FORM,
    ...initialValues
  });

  function update<K extends keyof CorporateCreateRequest>(key: K, value: CorporateCreateRequest[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate(form);
  }

  return (
    <form className="ops-card request-form" onSubmit={submit}>
      <div className="card-title-row">
        <h2>{title}</h2>
        {onCancel ? <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button> : null}
      </div>
      <div className="form-grid">
        <label><span>Traveller name</span><input value={form.travellerName} onChange={(event) => update("travellerName", event.target.value)} required /></label>
        <label><span>Traveller email</span><input type="email" value={form.travellerEmail} onChange={(event) => update("travellerEmail", event.target.value)} required /></label>
        <label><span>Company</span><input value={form.company} onChange={(event) => update("company", event.target.value)} required /></label>
        <label><span>Origin</span><input value={form.origin} onChange={(event) => update("origin", event.target.value)} required /></label>
        <label><span>Destination</span><input value={form.destination} onChange={(event) => update("destination", event.target.value)} required /></label>
        <label><span>Depart date</span><input type="date" value={form.departDate} onChange={(event) => update("departDate", event.target.value)} required /></label>
        <label><span>Return date</span><input type="date" value={form.returnDate} onChange={(event) => update("returnDate", event.target.value)} required /></label>
        <label><span>Budget</span><input type="number" value={form.budgetAmount} onChange={(event) => update("budgetAmount", Number(event.target.value))} required /></label>
        <label><span>Currency</span><select value={form.budgetCurrency} onChange={(event) => update("budgetCurrency", event.target.value)}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
        <label className="span-2"><span>Travel purpose</span><textarea value={form.purpose} onChange={(event) => update("purpose", event.target.value)} required /></label>
        <label className="span-2"><span>Preferences</span><textarea value={form.preferences} onChange={(event) => update("preferences", event.target.value)} /></label>
        <label className="span-2"><span>Special requests</span><textarea value={form.specialRequests} onChange={(event) => update("specialRequests", event.target.value)} /></label>
      </div>
      <div className="button-row">
        <button className="primary-button" type="submit"><ClipboardCheck size={16} /> {submitLabel}</button>
      </div>
    </form>
  );
}

type WorkspaceTab = "overview" | "missing" | "plan" | "policy" | "documents" | "approval" | "activity";

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "missing", label: "Missing Info" },
  { id: "plan", label: "Plan" },
  { id: "policy", label: "Policy & Budget" },
  { id: "documents", label: "Documents & Visa" },
  { id: "approval", label: "Approval & Finalize" },
  { id: "activity", label: "Activity" },
];

function RequestDetail({ request, onChange }: { request: CorporateTravelRequest; onChange: (request: CorporateTravelRequest) => void }) {
  const [draft, setDraft] = useState(request);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [statusMessage, setStatusMessage] = useState("");
  const [working, setWorking] = useState(false);
  const selectedPlan = draft.recommendedPlans.find((plan) => plan.selected) || draft.recommendedPlans[0];

  useEffect(() => {
    setDraft(request);
    setStatusMessage("");
  }, [request]);

  function updateDraft<K extends keyof CorporateTravelRequest>(key: K, value: CorporateTravelRequest[K]) {
    setDraft((current) => ({ ...current, [key]: value, lastUpdated: new Date().toISOString() }));
  }

  function updatePlan(id: string, patch: Partial<CorporatePlanOption>) {
    setDraft((current) => ({
      ...current,
      recommendedPlans: current.recommendedPlans.map((plan) => plan.id === id ? { ...plan, ...patch } : plan)
    }));
  }

  function selectPlan(id: string) {
    setDraft((current) => ({
      ...current,
      recommendedPlans: current.recommendedPlans.map((plan) => ({ ...plan, selected: plan.id === id })),
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

  async function saveEdits() {
    try {
      const saved = await updateCorporateRequest(draft.id, {
        aiSummary: draft.aiSummary,
        readinessCheck: draft.readinessCheck,
        budgetPolicyCheck: draft.budgetPolicyCheck,
        recommendedPlans: draft.recommendedPlans,
        missingInformation: draft.missingInformation,
        customerMessageDraft: draft.customerMessageDraft,
        finalItineraryDraft: draft.finalItineraryDraft,
        status: draft.status,
        budgetStatus: draft.budgetStatus,
        approvalStatus: draft.approvalStatus,
        finalApproved: draft.finalApproved
      });
      setDraft(saved);
      onChange(saved);
      setStatusMessage("Edits saved.");
    } catch {
      onChange(draft);
      setStatusMessage("Saved locally. Backend update is unavailable.");
    }
  }

  async function approveFinal() {
    const approved = { ...draft, finalApproved: true, status: "finalized" as const, approvalStatus: draft.approvalStatus || "Received", lastUpdated: new Date().toISOString() };
    setDraft(approved);
    try {
      await updateCorporateRequest(draft.id, {
        aiSummary: approved.aiSummary,
        readinessCheck: approved.readinessCheck,
        budgetPolicyCheck: approved.budgetPolicyCheck,
        recommendedPlans: approved.recommendedPlans,
        missingInformation: approved.missingInformation,
        customerMessageDraft: approved.customerMessageDraft,
        finalItineraryDraft: approved.finalItineraryDraft,
        status: approved.status,
        budgetStatus: approved.budgetStatus,
        approvalStatus: approved.approvalStatus,
        finalApproved: approved.finalApproved
      });
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

  async function downloadRequestExcel() {
    try {
      const blob = await downloadCorporateRequestExcel(draft.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.id}-final-itinerary.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatusMessage("Final itinerary Excel export is unavailable. Please retry after the service is back.");
    }
  }

  return (
    <section className="ops-card request-detail-card">
      <div className="detail-panel-head">
        <h2>Request Details</h2>
        <StatusPill value="in progress" />
        <button className="icon-button" aria-label="More request actions" type="button"><MoreVertical size={16} /></button>
      </div>
      <div className="request-id-row">
        <strong>{draft.id}</strong>
        <button className="copy-button" type="button" aria-label="Copy request id">□</button>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="Request workspace tabs">
        {WORKSPACE_TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {statusMessage ? <p className="workspace-status" role="status">{statusMessage}</p> : null}

      {activeTab === "overview" ? (
        <section className="workspace-panel" role="tabpanel">
          <div className="detail-summary-grid">
            <div className="traveler-mini">
              <span className="avatar large">{initialsFor(draft.travellerName)}</span>
              <div>
                <strong>{draft.travellerName}</strong>
                <span>{draft.purpose || "Business traveler"}</span>
                <span>{draft.travellerEmail || "traveler email pending"}</span>
              </div>
            </div>
            <dl className="request-meta">
              <div><dt>Request Type</dt><dd>Business Trip</dd></div>
              <div><dt>Policy</dt><dd>Global Travel Policy</dd></div>
              <div><dt>Submitted</dt><dd>{formatUpdated(draft.lastUpdated)}</dd></div>
              <div><dt>Purpose</dt><dd>{draft.purpose || "Client meetings and product review"}</dd></div>
              <div><dt>Department</dt><dd>{draft.company || "Company pending"}</dd></div>
              <div><dt>Trip Window</dt><dd>{formatDate(draft.departDate)} - {formatDate(draft.returnDate)}</dd></div>
              <div><dt>Next Action</dt><dd>{nextActionFor(draft)}</dd></div>
            </dl>
          </div>
          <div className="detail-info-card blue">
            <strong>Route</strong>
            <span>{routeText(draft)}</span>
            <strong>Dates</strong>
            <span>{formatDate(draft.departDate)} - {formatDate(draft.returnDate)}</span>
            <strong>Priority</strong>
            <span>{priorityFor(draft)}</span>
            <strong>Assigned</strong>
            <span>travel ops</span>
          </div>
          <div className="detail-info-card amber">
            <strong>Alerts</strong>
            <ul>
              <li>{draft.missingInformation || "No missing information flagged."}</li>
            </ul>
          </div>
          <div className="detail-actions">
            <button className="primary-button" type="button" onClick={() => void generatePlan()} disabled={working}>{working ? "Planning..." : "Generate AI Plan"}</button>
            <button className="secondary-button" type="button" onClick={() => setActiveTab("plan")}><Sparkles size={16} /> Review Plan</button>
          </div>
        </section>
      ) : null}

      {activeTab === "missing" ? (
        <section className="workspace-panel" role="tabpanel">
          <EditableSection title="Missing Information" icon={AlertTriangle} value={draft.missingInformation} onChange={(value) => updateDraft("missingInformation", value)} />
          <EditableSection title="Customer Message Draft" icon={MessageSquare} value={draft.customerMessageDraft} onChange={(value) => updateDraft("customerMessageDraft", value)} />
          <div className="detail-actions">
            <button className="secondary-button" type="button" onClick={() => void saveEdits()}><MessageSquare size={16} /> Save Edits</button>
          </div>
        </section>
      ) : null}

      {activeTab === "plan" ? (
        <section className="workspace-panel" role="tabpanel">
          <div className="detail-summary-grid">
            <EditableSection title="AI Summary" icon={Sparkles} value={draft.aiSummary} onChange={(value) => updateDraft("aiSummary", value)} />
            <EditableSection title="Customer Message Draft" icon={MessageSquare} value={draft.customerMessageDraft} onChange={(value) => updateDraft("customerMessageDraft", value)} />
          </div>
          {draft.recommendedPlans.length ? (
            <div className="plan-option-grid">
              {draft.recommendedPlans.map((plan) => (
                <article className={plan.selected ? "ops-card selected-plan" : "ops-card"} key={plan.id}>
                  <div className="card-title-row">
                    <h3>{plan.name}</h3>
                    <button className="secondary-button" type="button" onClick={() => selectPlan(plan.id)}>Select</button>
                  </div>
                  <p>{plan.flightSummary}</p>
                  <p>{plan.hotelSummary}</p>
                  <strong>{formatMoney(plan.totalAmount, plan.currency)}</strong>
                  <p>{plan.policyFit}</p>
                  <p>{plan.tradeoffs}</p>
                </article>
              ))}
            </div>
          ) : <div className="empty-panel">Generate a plan to compare options.</div>}
          <div className="detail-actions">
            <button className="primary-button" type="button" onClick={() => void generatePlan()} disabled={working}>{working ? "Planning..." : "Generate AI Plan"}</button>
            <button className="secondary-button" type="button" onClick={() => void saveEdits()}><MessageSquare size={16} /> Save Edits</button>
          </div>
        </section>
      ) : null}

      {activeTab === "policy" ? (
        <section className="workspace-panel" role="tabpanel">
          <EditableSection title="Budget Policy Check" icon={WalletCards} value={draft.budgetPolicyCheck} onChange={(value) => updateDraft("budgetPolicyCheck", value)} />
          <div className="detail-info-card blue">
            <strong>Budget</strong>
            <span>{formatMoney(draft.budgetAmount, draft.budgetCurrency)}</span>
            <strong>Budget status</strong>
            <span>{draft.budgetStatus}</span>
            <strong>Approval</strong>
            <span>{draft.approvalStatus}</span>
            <strong>Selected cost</strong>
            <span>{selectedPlan ? formatMoney(selectedPlan.totalAmount, selectedPlan.currency) : "No plan selected"}</span>
          </div>
        </section>
      ) : null}

      {activeTab === "documents" ? (
        <section className="workspace-panel" role="tabpanel">
          <EditableSection title="Readiness Check" icon={ShieldCheck} value={draft.readinessCheck} onChange={(value) => updateDraft("readinessCheck", value)} />
          <div className="detail-info-card amber">
            <strong>Visa</strong>
            <span>{draft.visaStatus}</span>
            <strong>Traveler</strong>
            <span>{draft.travellerEmail || "traveler email pending"}</span>
            <strong>Special requests</strong>
            <span>{draft.specialRequests || "None captured"}</span>
          </div>
        </section>
      ) : null}

      {activeTab === "approval" ? (
        <section className="workspace-panel" role="tabpanel">
          <EditableSection title="Final Itinerary Preview" icon={ClipboardCheck} value={draft.finalItineraryDraft} onChange={(value) => updateDraft("finalItineraryDraft", value)} />
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
          <div className="detail-actions">
            <button className="secondary-button" type="button" onClick={() => void saveEdits()}><MessageSquare size={16} /> Save Edits</button>
            <button className="secondary-button" type="button" onClick={() => void approveFinal()} disabled={draft.approvalStatus === "Rejected"}><ClipboardCheck size={16} /> Generate Final Itinerary</button>
            {draft.finalApproved || draft.status === "finalized" ? (
              <button className="secondary-button" type="button" onClick={() => void downloadRequestExcel()}><Download size={16} /> Download Export</button>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section className="workspace-panel" role="tabpanel">
          <div className="detail-info-card blue">
            <strong>Status</strong>
            <span>{draft.status.replace(/_/g, " ")}</span>
            <strong>Last updated</strong>
            <span>{formatUpdated(draft.lastUpdated)}</span>
            <strong>Request</strong>
            <span>{draft.originalRequest || "No original request text captured."}</span>
            <strong>Booking boundary</strong>
            <span>Planning only. No booking or payment is created here.</span>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function AiPlanningAssistant({ request }: { request: CorporateTravelRequest }) {
  const selectedPlan = request.recommendedPlans.find((plan) => plan.selected) || request.recommendedPlans[0];
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<TravelChatLine[]>([
    { role: "assistant", content: `Hi Jane, I can help you plan the best trip for ${request.travellerName.split(" ")[0] || "this traveler"}. What would you like to work on?` }
  ]);

  useEffect(() => {
    setChatMessages([{ role: "assistant", content: `Hi Jane, I can help you plan the best trip for ${request.travellerName.split(" ")[0] || "this traveler"}. What would you like to work on?` }]);
    setChatInput("");
  }, [request.id, request.travellerName]);

  function respond(prompt: string) {
    setChatMessages((current) => [
      ...current,
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: selectedPlan
          ? `Here are the best ${selectedPlan.name.toLowerCase()} options for ${routeText(request)}. ${selectedPlan.tradeoffs}`
          : `I can compare compliant options for ${routeText(request)} once the travel plan is generated.`
      }
    ]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!chatInput.trim()) return;
    respond(chatInput);
    setChatInput("");
  }

  return (
    <aside className="ops-card ai-assistant-card" aria-label="AI Planning Assistant">
      <div className="assistant-head">
        <div>
          <h2>AI Planning Assistant <span>Beta</span></h2>
        </div>
        <div>
          <button className="icon-button" aria-label="Expand assistant" type="button"><Expand size={16} /></button>
          <button className="icon-button" aria-label="Assistant history" type="button"><History size={16} /></button>
          <button className="icon-button" aria-label="Assistant options" type="button"><MoreVertical size={16} /></button>
        </div>
      </div>
      <div className="assistant-suggestions">
        <p>Suggested actions</p>
        {[
          `Create a cheaper option for ${routeText(request)}`,
          `Keep this within ${formatMoney(request.budgetAmount, request.budgetCurrency)}`,
          `Find a hotel closer to ${request.destination || "the meeting location"}`,
          "Check visa & entry requirements",
          "Compare policy-compliant options"
        ].map((prompt) => (
          <button key={prompt} type="button" onClick={() => respond(prompt)}><Plane size={15} /> {prompt}<span>›</span></button>
        ))}
      </div>
      <div className="agent-chat-feed assistant-feed" aria-live="polite">
        {chatMessages.map((message, index) => (
          <div className={`agent-chat-line ${message.role}`} key={`${message.role}-${index}`}>
            <p>{message.content}</p>
          </div>
        ))}
        {selectedPlan ? (
          <div className="flight-result-card">
            <div><strong>{selectedPlan.name}</strong><StatusPill value="selected option" /></div>
            <div className="flight-times"><span>{request.origin || "Origin pending"}</span><span>{request.destination || "Destination pending"}</span></div>
            <span>{selectedPlan.flightSummary}</span>
            <strong>{formatMoney(selectedPlan.totalAmount, selectedPlan.currency)}</strong>
          </div>
        ) : null}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input aria-label="Chat message" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask anything about this trip..." />
        <button className="icon-button" type="submit" aria-label="Send"><Send size={16} /></button>
      </form>
      <small>AI responses may be inaccurate. Verify important information.</small>
    </aside>
  );
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

export function TripPlannerScreen() {
  return <TravelerDashboard />;
}

export function CustomerIntakeScreen() {
  return <TravelerDashboard />;
}

export function RequestWorkspaceScreen({ requestId }: { requestId: string }) {
  const [requests, setRequests] = useState<CorporateTravelRequest[]>([]);
  const [notification, setNotification] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    listCorporateRequests().then(setRequests).catch(() => setRequests([]));
  }, []);

  const request = requests.find((item) => item.id === requestId) || requests[0] || null;

  async function sendApprovalEmail() {
    if (!request) return;
    setSendingNotification(true);
    setNotification("Sending approval email...");
    try {
      const result = await sendCorporateRequestNotification(request.id, {
        kind: "approval_request",
        to: [request.travellerEmail || "manager@example.com"],
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
        </article>
        <article className="ops-card detail-card">
          <h2>Communication Thread</h2>
          <p>{request?.originalRequest || "No live request conversation loaded yet."}</p>
          <textarea aria-label="Internal note" defaultValue={request?.customerMessageDraft || ""} />
        </article>
        <article className="ops-card detail-card">
          <h2>Policy & Budget</h2>
          <pre>{request?.budgetPolicyCheck || "Generate a plan to calculate policy and budget posture."}</pre>
          <button className="primary-button" type="button" onClick={() => void sendApprovalEmail()} disabled={sendingNotification}><Send size={16} /> Send Approval Email</button>
          {notification ? <p role="status">{notification}</p> : null}
        </article>
      </section>
    </AppShell>
  );
}

export function ItineraryBuilderScreen({ requestId }: { requestId: string }) {
  const [requests, setRequests] = useState<CorporateTravelRequest[]>([]);

  useEffect(() => {
    listCorporateRequests().then(setRequests).catch(() => setRequests([]));
  }, []);

  const request = requests.find((item) => item.id === requestId) || requests[0] || null;
  const plans = request?.recommendedPlans || [];
  const total = plans[0]?.totalAmount || request?.budgetAmount || 0;
  const manualSourcingRequired = plans.some((plan) => {
    const text = `${plan.flightSummary} ${plan.hotelSummary} ${plan.policyFit}`.toLowerCase();
    return text.includes("manual sourcing") || text.includes("manual review");
  });

  return (
    <AppShell active="itineraries">
      <section className="page-heading">
        <div>
          <h1>Itinerary Builder</h1>
          <p>Build the reviewed itinerary from provider-informed options, budget posture, policy warnings, and agent edits.</p>
        </div>
      </section>
      <section className="workspace-grid">
        <article className="ops-card detail-card">
          <span className="eyebrow">Total Estimated Budget</span>
          <h2>{formatMoney(total, request?.budgetCurrency || "USD")}</h2>
          <div className="progress-track"><span style={{ width: "72%" }} /></div>
          <p>{request?.budgetPolicyCheck || "Budget check pending."}</p>
        </article>
        {manualSourcingRequired ? (
          <article className="ops-card detail-card">
            <div className="card-title-row"><h2><AlertTriangle size={18} /> Manual Sourcing Required</h2><StatusPill value="Needs Review" /></div>
            <p>Do not finalize until an agent attaches verified provider options.</p>
          </article>
        ) : null}
        {plans.length ? plans.map((plan) => (
          <article className="ops-card plan-card" key={plan.id}>
            <div className="plan-card-head"><h2>{plan.name}</h2><StatusPill value={plan.policyFit || "Needs Review"} /></div>
            <p>{plan.flightSummary}</p>
            <p>{plan.hotelSummary}</p>
            <strong>{formatMoney(plan.totalAmount, plan.currency)}</strong>
          </article>
        )) : (
          <article className="ops-card detail-card"><h2>No provider options loaded</h2><p>Generate a plan from the request workspace before finalizing.</p></article>
        )}
      </section>
    </AppShell>
  );
}

export function TravelerRosterScreen() {
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);

  useEffect(() => {
    listTravelers().then(setTravelers).catch(() => setTravelers([]));
  }, []);

  return (
    <AppShell active="travelers">
      <section className="page-heading">
        <div>
          <h1>Traveler Roster</h1>
          <p>Manage corporate travelers, VIP status, documents, loyalty, and preference readiness.</p>
        </div>
      </section>
      <section className="ops-card table-card">
        <div className="request-table">
          <div className="request-table-head"><span>Traveler</span><span>Company</span><span>Status</span><span>Programs</span></div>
          {travelers.map((traveler) => (
            <Link className="request-table-row" href={`/travelers/${traveler.id}`} key={traveler.id}>
              <span>{traveler.name}<small>{traveler.email}</small></span>
              <span>{traveler.company}</span>
              <StatusPill value={traveler.status} />
              <span>{traveler.loyalty_programs.map((program) => program.provider).join(", ") || "None linked"}</span>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export function TravelerDossierScreen({ travelerId }: { travelerId: string }) {
  const [traveler, setTraveler] = useState<TravelerProfile | null>(null);

  useEffect(() => {
    getTraveler(travelerId).then(setTraveler).catch(() => setTraveler(null));
  }, [travelerId]);

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
        <article className="ops-card detail-card"><h2>Travel Documents</h2>{traveler?.documents.map((doc) => <p key={doc.label}><strong>{doc.label}</strong> {doc.status}</p>) || <p>No documents loaded</p>}</article>
        <article className="ops-card detail-card"><h2>Policy Guard</h2>{traveler?.policy_notes.map((note) => <p key={note}>{note}</p>) || <p>No policy exceptions loaded</p>}</article>
      </section>
    </AppShell>
  );
}

export function PolicyCenterScreen({ policyId }: { policyId?: string }) {
  const [policies, setPolicies] = useState<PolicyGroup[]>([]);
  const [selected, setSelected] = useState<PolicyGroup | null>(null);

  useEffect(() => {
    listPolicies().then((items) => {
      setPolicies(items);
      setSelected(policyId ? items.find((item) => item.id === policyId) || null : items[0] || null);
    }).catch(() => {
      setPolicies([]);
      setSelected(null);
    });
  }, [policyId]);

  return (
    <AppShell active="policy">
      <section className="page-heading">
        <div><h1>Policy Center</h1><p>Manage corporate travel governance and rule automation across the portfolio.</p></div>
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
      </section>
    </AppShell>
  );
}

export function PolicyReviewScreen({ policyId }: { policyId: string }) {
  const [versions, setVersions] = useState<PolicyRevision[]>([]);

  useEffect(() => {
    listPolicyVersions(policyId).then(setVersions).catch(() => setVersions([]));
  }, [policyId]);

  const revision = versions[0] || null;
  return (
    <AppShell active="policy">
      <section className="page-heading">
        <div><h1>Policy Review Dashboard</h1><p>Compare proposed rules, review impact, and approve or request changes.</p></div>
      </section>
      <section className="workspace-grid">
        <article className="ops-card detail-card"><h2>Revision Lifecycle</h2><StatusPill value={revision?.status || "In Review"} /><p>{revision?.summary || "No active revision loaded."}</p></article>
        <article className="ops-card detail-card"><h2>Proposed Rules</h2>{revision?.proposed_rules.map((rule) => <p key={rule.label}><strong>{rule.label}</strong> {rule.value}</p>) || <p>No proposed rules</p>}</article>
        <article className="ops-card detail-card"><h2>AI Impact Analysis</h2><p>{revision?.impact_analysis || "Impact analysis pending."}</p></article>
      </section>
    </AppShell>
  );
}

export function PolicyActivityArchiveScreen() {
  const [events, setEvents] = useState<PolicyActivityEvent[]>([]);

  useEffect(() => {
    listPolicyActivity().then(setEvents).catch(() => setEvents([]));
  }, []);

  return (
    <AppShell active="policy">
      <section className="page-heading">
        <div><h1>Policy Activity Archive</h1><p>Complete audit trail of policy modifications and agent interactions.</p></div>
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

export function AdminDashboard() {
  const [summary, setSummary] = useState<CorporateAdminSummary>(() => summaryFromRequests([]));
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<CorporateUploadResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
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
    } catch {
      setUploadResult({ totalRows: 0, createdRequests: 0, skippedRows: 0, requests: [] });
    } finally {
      setStatus("idle");
    }
  }

  async function downloadTemplate() {
    try {
      const blob = await downloadCorporateExcelTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "corporate_travel_requests_template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setUploadResult({ totalRows: 0, createdRequests: 0, skippedRows: 0, requests: [] });
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
          <p>Upload company data, manage policy/client context, and keep the agent workspace supplied with trusted information.</p>
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
            <h2>Upload Company Data</h2>
            <FileSpreadsheet size={18} />
          </div>
          <p className="muted-copy">Workbook sheets can include travel requests, company policy, traveller history, and visa rules.</p>
          <button className="secondary-button" type="button" onClick={() => void downloadTemplate()}>
            <Download size={16} /> Download Template
          </button>
          <label className="file-input">
            <Upload size={18} />
            <span>{uploadFile ? uploadFile.name : "Select Excel file"}</span>
            <input type="file" accept=".xlsx" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
          </label>
          <button className="primary-button" type="button" disabled={!uploadFile || status === "uploading"} onClick={() => void uploadFileToBackend()}>
            {status === "uploading" ? "Uploading..." : "Upload Requests"}
          </button>
          {uploadResult ? (
            <div className="upload-result" role="status">
              <p><strong>{uploadResult.createdRequests}</strong> created from <strong>{uploadResult.totalRows}</strong> rows</p>
              <p>{uploadResult.skippedRows} skipped</p>
              {uploadResult.requests.map((request) => <span key={request.id}>{request.id}</span>)}
            </div>
          ) : null}
        </section>
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
    </AppShell>
  );
}
