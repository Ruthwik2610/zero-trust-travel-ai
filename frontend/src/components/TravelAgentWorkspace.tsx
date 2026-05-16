"use client";

import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Plane,
  Save,
  Send,
  ShieldAlert,
  Users
} from "lucide-react";
import { useMemo, useState } from "react";
import { planTrip, saveTrip } from "@/lib/api";
import type { Cabin, Offer, PlanResponse, Risk, TravelRequest } from "@/lib/types";
import { ZeroTrustRail } from "./ZeroTrustRail";

const statusSteps = ["Intent parsed", "Policy checked", "Offers ranked", "Approval packet ready"];

const defaultRequest: TravelRequest = {
  origin: "SFO",
  destination: "LHR",
  depart_date: "2026-06-18",
  return_date: "2026-06-24",
  travelers: 2,
  cabin: "business",
  budget_usd: 6500,
  purpose: "Find a compliant London itinerary with low emissions, flexible fare rules, and a quiet hotel near Canary Wharf."
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function riskCopy(risk: Risk) {
  if (risk === "high") return "High approval risk";
  if (risk === "medium") return "Medium policy risk";
  return "Low policy risk";
}

function offerStatus(offer: Offer, response: PlanResponse | null) {
  if (!response) return "approved";
  return response.trip.policy_checks.some((check) => check.toLowerCase().includes("approval")) ? "review" : "approved";
}

function cabinLabel(cabin: Cabin) {
  return cabin === "premium_economy" ? "Premium Economy" : cabin[0].toUpperCase() + cabin.slice(1);
}

export function TravelAgentWorkspace() {
  const [request, setRequest] = useState<TravelRequest>(defaultRequest);
  const [response, setResponse] = useState<PlanResponse | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>("");

  const offers = response?.trip.flight_offers ?? [];
  const selected = useMemo(() => {
    if (!offers.length) return null;
    return offers.find((offer) => offer.id === selectedOfferId) ?? offers[0];
  }, [offers, selectedOfferId]);

  const update = (patch: Partial<TravelRequest>) => setRequest((current) => ({ ...current, ...patch }));

  async function submitPlan() {
    setLoading(true);
    setNotice("");
    try {
      const planned = await planTrip(request);
      setResponse(planned);
      setSelectedOfferId(planned.trip.flight_offers[0]?.id ?? "");
      setNotice(planned.user_message);
    } catch {
      setNotice("The travel agent could not complete that request safely. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrentTrip() {
    setSaving(true);
    setNotice("");
    try {
      const saved = await saveTrip(request);
      setNotice(`Trip ${saved.id} saved to the travel ledger.`);
    } catch {
      setNotice("The trip could not be saved safely. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          <Plane size={22} />
        </div>
        <div>
          <p className="eyebrow">Zero Trust Travel AI</p>
          <h1>Agentic travel workspace</h1>
        </div>
        <nav aria-label="Primary">
          <Link href="/admin">Admin</Link>
        </nav>
      </header>

      <section className="workspace-grid">
        <div className="planner-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Plan request</p>
              <h2>Corporate trip</h2>
            </div>
            <button className="icon-button" type="button" aria-label="Save trip" onClick={saveCurrentTrip} disabled={saving}>
              <Save size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="control-grid">
            <label>
              <span>From</span>
              <input value={request.origin} onChange={(event) => update({ origin: event.target.value.toUpperCase() })} />
            </label>
            <label>
              <span>To</span>
              <input value={request.destination} onChange={(event) => update({ destination: event.target.value.toUpperCase() })} />
            </label>
            <label>
              <span>Depart</span>
              <input type="date" value={request.depart_date} onChange={(event) => update({ depart_date: event.target.value })} />
            </label>
            <label>
              <span>Return</span>
              <input type="date" value={request.return_date ?? ""} onChange={(event) => update({ return_date: event.target.value || null })} />
            </label>
            <label>
              <span>Passengers</span>
              <input type="number" min="1" max="9" value={request.travelers} onChange={(event) => update({ travelers: Number(event.target.value) || 1 })} />
            </label>
            <label>
              <span>Cabin</span>
              <select value={request.cabin} onChange={(event) => update({ cabin: event.target.value as Cabin })}>
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium Economy</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
            </label>
          </div>

          <div className="risk-preview">
            <ShieldAlert size={20} aria-hidden="true" />
            <div>
              <strong>{response ? riskCopy(response.risk) : "Policy risk pending"}</strong>
              <p>{response?.trip.policy_checks[0] ?? `${cabinLabel(request.cabin)} cabin, ${request.travelers} traveler${request.travelers === 1 ? "" : "s"}.`}</p>
            </div>
            <span>{response?.risk ?? "new"}</span>
          </div>

          <label className="prompt-box">
            <span>Agent prompt</span>
            <textarea value={request.purpose ?? ""} onChange={(event) => update({ purpose: event.target.value })} />
          </label>

          <div className="action-row">
            <button className="primary-button" type="button" onClick={submitPlan} disabled={loading}>
              <Send size={17} aria-hidden="true" />
              {loading ? "Planning" : "Plan trip"}
            </button>
            <button className="secondary-button" type="button" onClick={saveCurrentTrip} disabled={saving}>
              <Save size={17} aria-hidden="true" />
              {saving ? "Saving" : "Save trip"}
            </button>
          </div>
          {notice ? <p className="notice-line" role="status">{notice}</p> : null}
        </div>

        <div className="run-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Agent run</p>
              <h2>Streaming status</h2>
            </div>
            <span className="live-dot">{loading ? "Live" : "Ready"}</span>
          </div>
          <div className="status-stream">
            {statusSteps.map((step, index) => (
              <div className="status-step" key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
                <Check size={16} aria-hidden="true" />
              </div>
            ))}
          </div>

          <div className="offer-list" aria-label="Offer comparison">
            {offers.length ? offers.map((offer) => (
              <button
                className={`offer-card ${selected?.id === offer.id ? "selected" : ""}`}
                key={offer.id}
                onClick={() => setSelectedOfferId(offer.id)}
                type="button"
              >
                <div>
                  <strong>{offer.title}</strong>
                  <p>{offer.provider}</p>
                </div>
                <div className="offer-meta">
                  <span>{offer.refundable ? "Refundable" : "Restricted"}</span>
                  <span>{formatCurrency(offer.price_usd)}</span>
                  <em className={offerStatus(offer, response)}>{offerStatus(offer, response)}</em>
                </div>
              </button>
            )) : (
              <div className="empty-state">Run the agent to compare compliant travel options.</div>
            )}
          </div>

          <div className="selected-offer">
            <div>
              <p className="eyebrow">Selected offer</p>
              <h3>{selected?.title ?? "No offer selected"}</h3>
            </div>
            <div className="metric-pair">
              <span>
                <CircleDollarSign size={16} aria-hidden="true" />
                {selected ? formatCurrency(selected.price_usd) : "$0"}
              </span>
              <span>
                <Clock3 size={16} aria-hidden="true" />
                {response?.trip.status ?? "draft"}
              </span>
            </div>
          </div>
        </div>

        <ZeroTrustRail auditEvents={response?.audit_events ?? []} />

        <div className="timeline-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Itinerary</p>
              <h2>Timeline</h2>
            </div>
            <div className="compact-icons" aria-hidden="true">
              <CalendarDays size={18} />
              <Users size={18} />
              <BriefcaseBusiness size={18} />
            </div>
          </div>
          <div className="timeline">
            {(response?.trip.itinerary ?? []).map((item) => (
              <article key={`${item.day}-${item.title}`}>
                <time>Day {item.day}</time>
                <ArrowRight size={16} aria-hidden="true" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.details}</p>
                </div>
                <span className={`status-pill ${response?.risk === "high" ? "review" : "approved"}`}>{response?.risk === "high" ? "review" : "approved"}</span>
              </article>
            ))}
            {!response ? <div className="empty-state">A day-by-day itinerary appears after the agent run.</div> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
