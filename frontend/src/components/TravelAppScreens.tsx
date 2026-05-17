"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  Gauge,
  HelpCircle,
  Home,
  IdCard,
  KeyRound,
  LayoutDashboard,
  Link2,
  Luggage,
  Moon,
  Plane,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  User,
  Users,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";

type Status = "valid" | "warning" | "approved" | "pending" | "blocked";

const logoMark = (
  <span className="unipro-logo-mark" aria-hidden="true">
    <span />
  </span>
);

function UniproLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`unipro-logo ${compact ? "compact" : ""}`}>
      {logoMark}
      {!compact ? <strong>UNIPRO</strong> : null}
    </div>
  );
}

function StatusPill({ status, children }: { status: Status; children: React.ReactNode }) {
  return <span className={`status-badge ${status}`}>{children}</span>;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const storage = typeof window.localStorage?.getItem === "function" ? window.localStorage : null;
    const stored = storage?.getItem("unipro-travel-theme");
    const prefersDark = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
    const initial = stored === "dark" || stored === "light"
      ? stored
      : prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem("unipro-travel-theme", next);
    }
  }

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

function AppSidebar({ active }: { active: "dashboard" | "planner" | "admin" }) {
  const links = [
    { href: "/dashboard", label: "Dashboard", icon: Home, key: "dashboard" },
    { href: "/planner", label: "Trips", icon: Plane, key: "planner" },
    { href: "/dashboard", label: "Visas", icon: IdCard, key: "visas" },
    { href: "/dashboard", label: "Preferences", icon: Settings, key: "preferences" },
    { href: "/dashboard", label: "Profile", icon: User, key: "profile" },
    { href: "/dashboard", label: "Reports", icon: BarChart3, key: "reports" },
    { href: "/dashboard", label: "Help & Support", icon: HelpCircle, key: "help" }
  ];
  return (
    <aside className="traveler-sidebar">
      <UniproLogo />
      <nav aria-label="Traveler navigation">
        {links.map(({ href, label, icon: Icon, key }) => (
          <Link className={active === key ? "active" : ""} href={href} key={key}>
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function TopUserBar({ name = "Vikram R." }: { name?: string }) {
  return (
    <header className="traveler-topbar">
      <ThemeToggle />
      <button aria-label="Notifications" className="ghost-icon"><Bell size={18} /></button>
      <span className="avatar">VR</span>
      <button className="profile-chip" type="button">
        {name}
        <ChevronDown size={15} />
      </button>
    </header>
  );
}

export function LoginScreen() {
  return (
    <main className="login-screen">
      <section className="login-hero">
        <ThemeToggle />
        <div className="hero-copy">
          <div className="hero-badge"><Sparkles size={15} /> Enterprise travel intelligence</div>
          <h1>Smarter Travel. Seamless Experiences.</h1>
          <p>AI-powered travel management for modern enterprises.</p>
        </div>
        <div className="trust-strip">
          <ShieldCheck size={17} />
          <span>Secure. Compliant. Built for Enterprise.</span>
        </div>
      </section>

      <section className="login-card" aria-label="Sign in">
        <UniproLogo />
        <h2>Welcome back!</h2>
        <p>Sign in to continue to your travel assistant.</p>
        <label>
          <span>Email address</span>
          <input autoComplete="email" placeholder="name@company.com" type="email" />
        </label>
        <label>
          <span>Password</span>
          <div className="password-field">
            <KeyRound size={16} />
            <input autoComplete="current-password" placeholder="Enter your password" type="password" />
          </div>
        </label>
        <div className="login-options">
          <label className="checkbox-line">
            <input defaultChecked type="checkbox" />
            Remember me
          </label>
          <button className="link-button" type="button">Forgot password?</button>
        </div>
        <Link className="primary-cta" href="/dashboard">Sign in</Link>
        <div className="divider"><span>or</span></div>
        <button className="microsoft-button" type="button">
          <span className="microsoft-mark" />
          Sign in with Microsoft
        </button>
      </section>
    </main>
  );
}

export function TravelerDashboard() {
  return (
    <main className="traveler-app">
      <AppSidebar active="dashboard" />
      <section className="traveler-main">
        <TopUserBar />
        <div className="section-title-row">
          <div>
            <h1>Hello, Vikram!</h1>
            <p>Here is your travel overview.</p>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard icon={Plane} label="Active Visas" value="2" hint="View all" />
          <MetricCard icon={Clock3} label="Expiring Soon" value="1" hint="in 45 days" tone="warning" />
          <MetricCard icon={CheckCircle2} label="Active Approvals (YTD)" value="5" hint="View all" tone="success" />
          <MetricCard icon={CalendarDays} label="Upcoming Travel" value="1" hint="Next 7 days" />
        </div>

        <div className="dashboard-grid">
          <section className="app-card visa-rule-card">
            <h2>Visa Rule Check</h2>
            <FieldRow label="Nationality" value="India" flag="IN" />
            <FieldRow label="Destination" value="South Africa" flag="ZA" />
            <div className="success-callout">
              <CheckCircle2 size={18} />
              <div>
                <strong>Visa Required</strong>
                <p>Indian citizens require a visa to travel to South Africa.</p>
              </div>
            </div>
            <Link href="/planner">View details</Link>
          </section>

          <section className="app-card">
            <h2>My Visas</h2>
            <VisaRow country="South Africa" type="Visitor Visa" date="12 Dec 2026" status="Valid" />
            <VisaRow country="UK" type="UK Standard Visitor" date="45 days" status="Expiring Soon" warning />
            <Link href="/dashboard">View all visas</Link>
          </section>

          <section className="app-card budget-card">
            <h2>Company Approved Budget</h2>
            <p>Johannesburg Trip - 10 to 17 Jun 2026</p>
            <strong>₹1,20,000</strong>
            <div className="progress-bar"><span style={{ width: "58%" }} /></div>
            <div className="budget-split">
              <span>Used ₹70,000</span>
              <span>Available ₹50,000</span>
            </div>
            <Link href="/dashboard">View policy</Link>
          </section>

          <section className="app-card trip-mini-card">
            <h2>Upcoming Trip</h2>
            <p>Johannesburg, South Africa</p>
            <strong>10 - 17 Jun 2026</strong>
          </section>

          <section className="app-card quick-actions">
            <h2>Quick Actions</h2>
            <div>
              <Link href="/planner"><Plane size={15} /> Plan New Trip</Link>
              <Link href="/dashboard"><Luggage size={15} /> My Bookings</Link>
              <Link href="/dashboard"><FileText size={15} /> Expense Reports</Link>
              <Link href="/dashboard"><IdCard size={15} /> Visa Documents</Link>
            </div>
          </section>

          <section className="app-card preferences-card">
            <h2>Traveler Preferences</h2>
            <p>Save time with your saved preferences.</p>
            <button type="button">Fill from past history</button>
          </section>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = "default" }: { icon: typeof Plane; label: string; value: string; hint: string; tone?: "default" | "warning" | "success" }) {
  return (
    <article className={`metric-card ${tone}`}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}

function FieldRow({ label, value, flag }: { label: string; value: string; flag: string }) {
  return (
    <div className="field-row">
      <span>{label}</span>
      <strong><em>{flag}</em>{value}</strong>
    </div>
  );
}

function VisaRow({ country, type, date, status, warning = false }: { country: string; type: string; date: string; status: string; warning?: boolean }) {
  return (
    <article className="visa-row">
      <IdCard size={18} />
      <div>
        <strong>{country}</strong>
        <p>{type}</p>
      </div>
      <span>{date}</span>
      <StatusPill status={warning ? "warning" : "valid"}>{status}</StatusPill>
    </article>
  );
}

const chatSteps = [
  "Checking entry requirements for your trip",
  "Found your South Africa Visitor Visa",
  "Entry requirements for South Africa are satisfied",
  "Your trip has been approved by your manager",
  "Your Johannesburg trip is within the approved budget"
];

export function TripPlannerScreen() {
  const [approved, setApproved] = useState(false);
  return (
    <main className="planner-screen">
      <section className="chat-panel">
        <div className="planner-header">
          <UniproLogo compact />
          <div>
            <h1>Trip Planner</h1>
            <p>Your AI Travel Assistant</p>
          </div>
          <div className="planner-icons"><Star size={17} /><Clock3 size={17} /><ShieldCheck size={17} /></div>
        </div>

        <div className="chat-list">
          {chatSteps.map((step, index) => (
            <article className="chat-message" key={step}>
              <UniproLogo compact />
              <CheckCircle2 size={16} className="chat-check" />
              <div>
                <strong>{step.split(" ").slice(0, 3).join(" ")}</strong>
                <p>{step}</p>
              </div>
              <time>10:{index + 1}1 AM</time>
            </article>
          ))}
          <article className="flight-strip" aria-label="Flight route HYD to JNB and JNB to HYD">
            <Plane size={18} />
            <strong>HYD</strong>
            <span>10 Jun</span>
            <ArrowText />
            <strong>JNB</strong>
            <span>17 Jun</span>
            <ArrowText />
            <strong>HYD</strong>
            <strong>₹1,20,000</strong>
          </article>
          <article className="chat-message final">
            <UniproLogo compact />
            <CheckCircle2 size={16} className="chat-check" />
            <div>
              <strong>Let's plan it out</strong>
              <p>How can I help you now?</p>
              <div className="chip-row">
                <button type="button" onClick={() => setApproved(true)}>Yes, Please</button>
                <button type="button">No, Thanks</button>
                <button type="button">Fill from past history</button>
              </div>
            </div>
            <time>10:21 AM</time>
          </article>
        </div>

        <label className="planner-input">
          <input placeholder="Type your message..." />
          <button aria-label="Send message" type="button"><Send size={18} /></button>
        </label>
        <p className="input-tip">Tip: Try "fill from past history" to auto-populate preferences.</p>
      </section>

      <section className="itinerary-panel">
        <div className="summary-card">
          <div className="card-heading">
            <h2>Itinerary Summary</h2>
            <StatusPill status="approved">Approved</StatusPill>
          </div>
          <RouteLine from="Hyderabad" to="Johannesburg" date="10 Jun 2026" />
          <RouteLine from="Johannesburg" to="Hyderabad" date="17 Jun 2026" />
          <div className="summary-split">
            <span>Travellers <strong>1 Adult</strong></span>
            <span>Trip Purpose <strong>Business</strong></span>
          </div>
          <div className="cost-line">
            <span>Total Trip Cost</span>
            <strong>₹96,500</strong>
          </div>
        </div>

        <div className="summary-card hotel-list">
          <h2>Hotel Recommendations</h2>
          {["Southern Sun Rosebank", "Radisson Blu Gautrain Hotel", "Protea Hotel by Marriott"].map((name, index) => (
            <article key={name}>
              <div className="hotel-thumb" />
              <div>
                <strong>{name}</strong>
                <p>₹{(12500 + index * 1900).toLocaleString("en-IN")} / night</p>
              </div>
            </article>
          ))}
          <Link href="/planner">View more hotels</Link>
        </div>
      </section>

      <section className="next-panel">
        <h2>What's next?</h2>
        {[
          ["Visa Check", "Completed"],
          ["Trip Approval", approved ? "Approved" : "Pending"],
          ["Budget Analysis", "Within Budget"],
          ["Flight Selection", "AI Recommended"],
          ["Hotel", "Standard"],
          ["Transfer & Activities", "Pending"]
        ].map(([label, state]) => (
          <div className="next-row" key={label}>
            <CheckCircle2 size={16} />
            <span>{label}</span>
            <strong>{state}</strong>
          </div>
        ))}
        <button className="primary-cta" type="button">Review Itinerary</button>
        <button className="outline-action" type="button"><Download size={16} /> Download Itinerary</button>
        <button className="outline-action" type="button"><Link2 size={16} /> Get Booking Link</button>
        <p>You can share this link to book and manage this trip effortlessly.</p>
      </section>
    </main>
  );
}

function ArrowText() {
  return <span className="arrow-text">→</span>;
}

function RouteLine({ from, to, date }: { from: string; to: string; date: string }) {
  return (
    <div className="route-line" aria-label={`${from} to ${to}`}>
      <strong>{from} <ArrowText /> {to}</strong>
      <span>{date}</span>
    </div>
  );
}

export function AdminDashboard() {
  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <UniproLogo />
        <nav aria-label="Admin navigation">
          <Link className="active" href="/admin"><LayoutDashboard size={17} /> Overview</Link>
          <Link href="/admin"><Users size={17} /> Users</Link>
          <Link href="/admin"><Building2 size={17} /> Company Policy</Link>
          <Link href="/admin"><CheckCircle2 size={17} /> Approvals <span>12</span></Link>
          <Link href="/admin"><FileText size={17} /> Reports</Link>
          <Link href="/admin"><Gauge size={17} /> Audit Logs</Link>
          <Link href="/admin"><Settings size={17} /> Settings</Link>
        </nav>
      </aside>
      <section className="admin-main">
        <TopUserBar name="Admin User" />
        <div className="metric-grid admin-metrics">
          <MetricCard icon={Plane} label="Active Trips" value="34" hint="This month" />
          <MetricCard icon={CircleDollarSign} label="Total Spend (YTD)" value="₹2,48,75,000" hint="+12% vs last year" tone="success" />
          <MetricCard icon={AlertTriangle} label="Pending Approvals" value="12" hint="Requires action" tone="warning" />
          <MetricCard icon={ShieldCheck} label="Policy Violations" value="5" hint="Needs attention" tone="warning" />
        </div>

        <div className="admin-dashboard-grid">
          <section className="app-card user-overview">
            <h2>Users & Travelers Overview</h2>
            <div className="donut-card">
              <AccessibleDonutChart
                label="Traveler role distribution"
                segments={[
                  { value: 196, color: "var(--brand)" },
                  { value: 36, color: "var(--brand-2)" },
                  { value: 28, color: "var(--violet)" },
                  { value: 12, color: "var(--warning)" }
                ]}
              />
              <ul>
                <li><span /> Travelers <strong>196</strong></li>
                <li><span /> Travel Managers <strong>36</strong></li>
                <li><span /> Finance <strong>28</strong></li>
                <li><span /> HR <strong>12</strong></li>
              </ul>
            </div>
          </section>

          <section className="app-card spend-category">
            <h2>Spend by Category (YTD)</h2>
            <div className="donut-card">
              <AccessibleDonutChart
                label="Travel spend by category"
                segments={[
                  { value: 46, color: "var(--brand)" },
                  { value: 20, color: "var(--brand-2)" },
                  { value: 13, color: "var(--success)" },
                  { value: 11, color: "var(--warning)" },
                  { value: 10, color: "var(--violet)" }
                ]}
              />
              <ul>
                <li>Flights <strong>46%</strong></li>
                <li>Hotels <strong>20%</strong></li>
                <li>Meals <strong>13%</strong></li>
                <li>Ground Transport <strong>11%</strong></li>
              </ul>
            </div>
          </section>

          <section className="app-card policies-card">
            <h2>Company Policies</h2>
            {["Travel Policy", "Visa Policy", "Budget Policy"].map((policy) => (
              <div className="policy-row" key={policy}>
                <FileText size={16} />
                <span>{policy}</span>
                <StatusPill status="valid">Active</StatusPill>
              </div>
            ))}
          </section>

          <section className="app-card approvals-table">
            <h2>Recent Approvals</h2>
            <table>
              <thead><tr><th>Requester</th><th>Traveler</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {[
                  ["John Verma", "Vikram R.", "₹85,000", "Approved"],
                  ["Shreya Gupta", "Aanya S.", "₹72,500", "Pending"],
                  ["USA Conference", "Arjun K.", "₹1,25,000", "Approved"],
                  ["London Sales Meet", "Rohit J.", "₹80,000", "Pending"]
                ].map((row) => (
                  <tr key={row.join("-")}><td>{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td><StatusPill status={row[3] === "Approved" ? "approved" : "pending"}>{row[3]}</StatusPill></td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="app-card alerts-card">
            <h2>Alerts & Reminders</h2>
            {["3 visa documents expiring in 60 days", "2 trip requests pending approval", "2 budget overspend alerts", "2 policy violations detected"].map((alert) => (
              <p key={alert}><AlertTriangle size={15} /> {alert}</p>
            ))}
          </section>

          <section className="app-card quick-actions admin-actions">
            <h2>Quick Actions</h2>
            <Link href="/admin"><Settings size={15} /> Add / Update Policy</Link>
            <Link href="/admin"><Users size={15} /> Manage Users & Roles</Link>
            <Link href="/admin"><BarChart3 size={15} /> View Spend Analytics</Link>
            <Link href="/admin"><WalletCards size={15} /> Budget Allocation</Link>
            <Link href="/admin"><FileText size={15} /> Generate Report</Link>
          </section>
        </div>
      </section>
    </main>
  );
}

function AccessibleDonutChart({ label, segments }: { label: string; segments: Array<{ value: number; color: string }> }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 25;

  return (
    <svg className="donut-chart" role="img" viewBox="0 0 42 42" aria-label={label}>
      <circle className="donut-ring" cx="21" cy="21" r="15.915" />
      {segments.map((segment, index) => {
        const share = (segment.value / total) * 100;
        const strokeDasharray = `${share} ${100 - share}`;
        const strokeDashoffset = offset;
        offset -= share;
        return (
          <circle
            className="donut-segment"
            cx="21"
            cy="21"
            key={`${segment.color}-${index}`}
            r="15.915"
            stroke={segment.color}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
          />
        );
      })}
    </svg>
  );
}
