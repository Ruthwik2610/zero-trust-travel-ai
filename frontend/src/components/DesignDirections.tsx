"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  IdCard,
  Plane,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards
} from "lucide-react";
import { useState, type ReactNode } from "react";

type Direction = "command" | "workspace" | "board";

const directions: Array<{ id: Direction; label: string; name: string }> = [
  { id: "command", label: "01", name: "Operations" },
  { id: "workspace", label: "02", name: "Workspace" },
  { id: "board", label: "03", name: "Board" }
];

const requests = [
  { id: "TR-2418", traveler: "Vikram Rao", route: "HYD -> JNB", stage: "Approval", priority: "High" },
  { id: "TR-2421", traveler: "Maya Chen", route: "SFO -> LHR", stage: "Plan", priority: "Medium" },
  { id: "TR-2424", traveler: "Elena Vance", route: "NYC -> CDG", stage: "Finalize", priority: "Low" }
];

export function DesignDirections() {
  const [active, setActive] = useState<Direction>("command");

  return (
    <main className="design-lab">
      <header className="design-lab-header">
        <div>
          <span>Unipro Travel Operations</span>
          <h1>Travel Operations</h1>
        </div>
        <nav aria-label="Design directions">
          {directions.map((direction) => (
            <button
              aria-label={`Show ${direction.name} design`}
              className={active === direction.id ? "active" : ""}
              key={direction.id}
              type="button"
              onClick={() => setActive(direction.id)}
            >
              <span>{direction.label}</span>
              {direction.name}
            </button>
          ))}
          <a className="design-live-link" href="/dashboard">Open live app</a>
        </nav>
      </header>

      {active === "command" ? <CommandDirection /> : null}
      {active === "workspace" ? <WorkspaceDirection /> : null}
      {active === "board" ? <BoardDirection /> : null}
    </main>
  );
}

function ShellChrome({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="design-shell" aria-label={name}>
      <aside className="design-rail">
        <div className="design-mark">U</div>
        <a className="active" aria-label="Open dashboard" href="/dashboard"><Plane size={18} /></a>
        <a aria-label="Open itinerary builder" href="/planner"><CalendarDays size={18} /></a>
        <a aria-label="Open travelers" href="/travelers"><IdCard size={18} /></a>
        <a aria-label="Open admin" href="/admin"><ShieldCheck size={18} /></a>
      </aside>
      <section className="design-stage">
        {children}
      </section>
    </section>
  );
}

function CommandDirection() {
  return (
    <ShellChrome name="Operations direction">
      <div className="design-topline">
        <div>
          <span>Today</span>
          <h2>Travel Operations</h2>
        </div>
        <div className="design-search-preview" aria-label="Search requests">
          <Search size={17} />
          <span>Search requests</span>
        </div>
      </div>

      <section className="command-grid">
        <section className="priority-panel">
          <div className="mini-title">
            <span>Requests</span>
            <strong>12</strong>
          </div>
          {requests.map((request) => (
            <article className="request-strip" key={request.id}>
              <span>{request.id}</span>
              <strong>{request.traveler}</strong>
              <p>{request.route}</p>
              <small>{request.stage}</small>
            </article>
          ))}
        </section>

        <section className="trip-focus">
          <div className="trip-focus-hero">
            <span>High priority</span>
            <h3>Vikram Rao</h3>
            <p>HYD -&gt; JNB</p>
          </div>
          <div className="step-row">
            {["Intake", "Readiness", "Plan", "Approval", "Export"].map((step, index) => (
              <span className={index < 3 ? "done" : index === 3 ? "current" : ""} key={step}>{step}</span>
            ))}
          </div>
          <div className="option-row selected">
            <Plane size={18} />
            <div>
              <strong>Best within budget</strong>
              <span>One-stop economy, Sandton hotel</span>
            </div>
            <b>INR 178K</b>
          </div>
          <div className="approval-band">
            <WalletCards size={18} />
            <span>Approval required</span>
            <a href="/dashboard">Send <ArrowRight size={15} /></a>
          </div>
        </section>

        <aside className="action-stack">
          <a href="/dashboard"><Sparkles size={17} /> Generate plan</a>
          <a href="/dashboard"><Send size={17} /> Send approval</a>
          <a href="/dashboard"><Download size={17} /> Export</a>
        </aside>
      </section>
    </ShellChrome>
  );
}

function WorkspaceDirection() {
  const [activeTab, setActiveTab] = useState("Plan");

  return (
    <ShellChrome name="Workspace direction">
      <div className="workspace-split">
        <aside className="traveler-card">
          <span className="portrait"><UserRound size={42} /></span>
          <h2>Elena Vance</h2>
          <p>NYC -&gt; CDG</p>
          <div className="traveler-stats">
            <span>Policy clear</span>
            <span>Passport ready</span>
            <span>Budget 82%</span>
          </div>
        </aside>

        <section className="workspace-main">
          <div className="workspace-tabs">
            {["Overview", "Plan", "Approval", "Activity"].map((tab) => (
              <button className={activeTab === tab ? "active" : ""} key={tab} type="button" onClick={() => setActiveTab(tab)}>{tab}</button>
            ))}
          </div>
          <div className="flight-board">
            <article className="flight-card selected">
              <span>Selected</span>
              <strong>Comfort-focused option</strong>
              <p>Direct routing, office-near hotel</p>
              <b>USD 2,420</b>
            </article>
            <article className="flight-card">
              <span>Alternative</span>
              <strong>Fastest route</strong>
              <p>Earlier arrival, higher fare</p>
              <b>USD 2,690</b>
            </article>
          </div>
          <div className="final-preview">
            <FileSpreadsheet size={18} />
            <span>Final itinerary draft</span>
            <a href="/planner">Review</a>
          </div>
        </section>
      </div>
    </ShellChrome>
  );
}

function BoardDirection() {
  const columns = [
    { name: "New", count: 7 },
    { name: "Pending Details", count: 3 },
    { name: "Completed", count: 2 }
  ];

  return (
    <ShellChrome name="Board direction">
      <div className="board-head">
        <div>
          <span>Operations board</span>
          <h2>Requests by stage</h2>
        </div>
        <a href="/dashboard"><CheckCircle2 size={17} /> New request</a>
      </div>
      <section className="stage-board">
        {columns.map((column, columnIndex) => (
          <section className="stage-column" key={column.name}>
            <div>
              <strong>{column.name}</strong>
              <span>{column.count}</span>
            </div>
            {requests.slice(0, columnIndex === 0 ? 1 : 3).map((request, index) => (
              <article className="board-request" key={`${column.name}-${request.id}`}>
                <span>{request.id}</span>
                <strong>{request.traveler}</strong>
                <p>{request.route}</p>
                <small>{index === 0 ? request.priority : "Normal"}</small>
              </article>
            ))}
          </section>
        ))}
      </section>
      <section className="board-footer">
        <span><Clock3 size={16} /> 4 urgent</span>
        <span><ShieldCheck size={16} /> 2 need review</span>
        <span><Download size={16} /> 6 ready soon</span>
      </section>
    </ShellChrome>
  );
}
