import { CheckCircle2, DatabaseZap, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import type { AuditEvent } from "@/lib/types";

type Gate = {
  label: string;
  value: string;
  state: "pass" | "review";
};

const gates: Gate[] = [
  { label: "Data minimization", value: "Profile, loyalty, policy only", state: "pass" },
  { label: "Policy gates", value: "5 passed, 1 review", state: "review" },
  { label: "Tool isolation", value: "Flight, hotel, expense sandboxes", state: "pass" },
  { label: "Approval status", value: "Manager approval queued", state: "review" }
];

const fallbackAuditIds = ["aud_7294", "pol_1840", "tool_5521"];

type ZeroTrustRailProps = {
  auditEvents?: AuditEvent[];
};

export function ZeroTrustRail({ auditEvents = [] }: ZeroTrustRailProps) {
  const auditIds = auditEvents.length ? auditEvents.map((event) => event.id) : fallbackAuditIds;

  return (
    <aside className="zero-trust-rail" aria-label="Zero trust controls">
      <div className="rail-header">
        <div className="icon-shell">
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">Zero-trust rail</p>
          <h2>Guarded agent run</h2>
        </div>
      </div>

      <div className="trust-meter" aria-label="Trust posture 86 percent">
        <span>86%</span>
        <div>
          <strong>Policy confidence</strong>
          <p>Low exposure, one approval gate open</p>
        </div>
      </div>

      <div className="gate-list">
        {gates.map((gate, index) => {
          const Icon = [DatabaseZap, LockKeyhole, Fingerprint, KeyRound][index];
          return (
            <div className="gate-row" key={gate.label}>
              <Icon size={18} aria-hidden="true" />
              <div>
                <span>{gate.label}</span>
                <p>{gate.value}</p>
              </div>
              <strong className={`status-pill ${gate.state}`}>{gate.state}</strong>
            </div>
          );
        })}
      </div>

      <div className="audit-box">
        <div className="audit-title">
          <CheckCircle2 size={17} aria-hidden="true" />
          <span>Audit ids</span>
        </div>
        <div className="audit-tags">
          {auditIds.map((id) => (
            <code key={id}>{id}</code>
          ))}
        </div>
      </div>
    </aside>
  );
}
