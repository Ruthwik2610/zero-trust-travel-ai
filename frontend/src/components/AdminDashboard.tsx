"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Server,
  ShieldCheck
} from "lucide-react";
import { useEffect, useState } from "react";
import { getAdminSummary, getAuditEvents, getTrips } from "@/lib/api";
import type { AdminSummary, AuditEvent, Trip } from "@/lib/types";

type AdminDashboardProps = {
  summary?: AdminSummary;
  auditEvents?: AuditEvent[];
  trips?: Trip[];
};

const defaultSummary: AdminSummary = {
  total_trips: 0,
  draft_trips: 0,
  booked_trips: 0,
  high_risk_trips: 0,
  audit_events: 0
};

const providerHealth = [
  { name: "Planner API", uptime: "99.98%", latency: "182 ms", status: "Operational" },
  { name: "Policy store", uptime: "99.91%", latency: "46 ms", status: "Operational" },
  { name: "Audit ledger", uptime: "99.95%", latency: "31 ms", status: "Operational" }
];

function compactCurrency(value: number) {
  return `$${(value / 1000).toFixed(1)}K`;
}

export function AdminDashboard({ summary: initialSummary, auditEvents: initialAuditEvents, trips: initialTrips }: AdminDashboardProps) {
  const [summary, setSummary] = useState<AdminSummary>(initialSummary ?? defaultSummary);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(initialAuditEvents ?? []);
  const [trips, setTrips] = useState<Trip[]>(initialTrips ?? []);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (initialSummary || initialAuditEvents || initialTrips) return;
    let cancelled = false;
    Promise.all([getAdminSummary(), getAuditEvents(), getTrips()])
      .then(([summaryResult, auditResult, tripResult]) => {
        if (cancelled) return;
        setSummary(summaryResult);
        setAuditEvents(auditResult);
        setTrips(tripResult);
      })
      .catch(() => {
        if (!cancelled) setNotice("Admin data is not available right now.");
      });
    return () => {
      cancelled = true;
    };
  }, [initialAuditEvents, initialSummary, initialTrips]);

  const monthlySpend = trips.reduce((sum, trip) => {
    const flight = trip.flight_offers[0]?.price_usd ?? 0;
    const hotel = trip.hotel_offers[0]?.price_usd ?? 0;
    return sum + flight + hotel;
  }, 0);
  const policyPassRate = summary.total_trips
    ? Math.round(((summary.total_trips - summary.high_risk_trips) / summary.total_trips) * 100)
    : 100;
  const pendingApprovals = summary.high_risk_trips + Math.max(0, summary.draft_trips - summary.booked_trips);

  const kpis = [
    { label: "Active trips", value: String(summary.total_trips), icon: Activity },
    { label: "Pending approvals", value: String(pendingApprovals), icon: AlertTriangle },
    { label: "Policy pass rate", value: `${policyPassRate}%`, icon: ShieldCheck },
    { label: "Monthly spend", value: compactCurrency(monthlySpend), icon: CircleDollarSign }
  ];

  const spendByStatus = [
    { label: "Draft", value: monthlySpend, className: "approved" },
    { label: "High risk", value: trips.filter((trip) => trip.risk === "high").reduce((sum, trip) => sum + (trip.flight_offers[0]?.price_usd ?? 0) + (trip.hotel_offers[0]?.price_usd ?? 0), 0), className: "review" },
    { label: "Booked", value: trips.filter((trip) => trip.status === "booked").reduce((sum, trip) => sum + (trip.flight_offers[0]?.price_usd ?? 0) + (trip.hotel_offers[0]?.price_usd ?? 0), 0), className: "blocked" }
  ];

  return (
    <main className="admin-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          <Database size={22} />
        </div>
        <div>
          <p className="eyebrow">Zero Trust Travel AI</p>
          <h1>Admin command center</h1>
        </div>
        <nav aria-label="Primary">
          <Link href="/">
            <ArrowLeft size={16} aria-hidden="true" />
            Workspace
          </Link>
        </nav>
      </header>

      {notice ? <p className="notice-line" role="status">{notice}</p> : null}

      <section className="kpi-grid" aria-label="Dashboard summary">
        {kpis.map(({ label, value, icon: Icon }) => (
          <article className="kpi-card" key={label}>
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Controls</p>
              <h2>Spend by policy status</h2>
            </div>
          </div>
          <div className="spend-bars">
            {spendByStatus.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <div className="bar-track">
                  <div className={`bar-fill ${item.className}`} style={{ width: `${Math.min(100, Math.max(18, item.value / 1500))}%` }} />
                </div>
                <strong>{compactCurrency(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Risk queue</p>
              <h2>Approval worklist</h2>
            </div>
          </div>
          <div className="risk-list">
            {trips.filter((trip) => trip.risk !== "low").slice(0, 4).map((trip) => (
              <article key={trip.id}>
                <AlertTriangle size={17} aria-hidden="true" />
                <div>
                  <strong>{trip.request.destination}</strong>
                  <p>{trip.policy_checks[0] ?? "Policy review required"}</p>
                </div>
                <span>{trip.risk}</span>
              </article>
            ))}
            {!trips.some((trip) => trip.risk !== "low") ? <div className="empty-state">No high-risk trips in the queue.</div> : null}
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Providers</p>
              <h2>Health</h2>
            </div>
            <Server size={19} aria-hidden="true" />
          </div>
          <div className="provider-list">
            {providerHealth.map((provider) => (
              <article key={provider.name}>
                <div>
                  <strong>{provider.name}</strong>
                  <p>{provider.latency}</p>
                </div>
                <span>{provider.uptime}</span>
                <em>{provider.status}</em>
              </article>
            ))}
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Audit</p>
              <h2>Recent events</h2>
            </div>
            <CheckCircle2 size={19} aria-hidden="true" />
          </div>
          <div className="audit-events">
            {auditEvents.slice(0, 5).map((event) => (
              <article key={event.id}>
                <time>{new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                <div>
                  <strong>{event.event_type}</strong>
                  <p>{event.message}</p>
                </div>
                <code>{event.id}</code>
              </article>
            ))}
            {!auditEvents.length ? <div className="empty-state">No audit events have been recorded.</div> : null}
          </div>
        </div>
      </section>

      <section className="table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved trips</p>
            <h2>Trip ledger</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Trip</th>
                <th>Route</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Spend</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id}>
                  <td>{trip.id}</td>
                  <td>{trip.request.origin} to {trip.request.destination}</td>
                  <td>
                    <span className={`status-pill ${trip.status === "booked" ? "approved" : "review"}`}>{trip.status}</span>
                  </td>
                  <td>{trip.risk}</td>
                  <td>{compactCurrency((trip.flight_offers[0]?.price_usd ?? 0) + (trip.hotel_offers[0]?.price_usd ?? 0))}</td>
                  <td>{new Date(trip.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {!trips.length ? (
                <tr>
                  <td colSpan={6}>No saved trips yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
