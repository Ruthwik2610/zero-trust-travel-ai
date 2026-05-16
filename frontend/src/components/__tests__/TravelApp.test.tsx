import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminDashboard } from "../AdminDashboard";
import { TravelAgentWorkspace } from "../TravelAgentWorkspace";

describe("Travel AI app surfaces", () => {
  it("renders the main workspace controls", () => {
    render(<TravelAgentWorkspace />);

    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByLabelText("Depart")).toBeInTheDocument();
    expect(screen.getByLabelText("Passengers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan trip" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });

  it("renders mocked admin summary metrics", () => {
    render(
      <AdminDashboard
        summary={{
          total_trips: 18,
          draft_trips: 5,
          booked_trips: 2,
          high_risk_trips: 3,
          audit_events: 9
        }}
        trips={[{
          id: "trip_test",
          request: {
            origin: "SFO",
            destination: "LHR",
            depart_date: "2026-06-18",
            return_date: "2026-06-24",
            travelers: 2,
            cabin: "business",
            budget_usd: 6500,
            purpose: "client meetings"
          },
          status: "draft",
          risk: "high",
          flight_offers: [{
            id: "offer_1",
            kind: "flight",
            title: "SFO to LHR",
            provider: "deterministic-planner",
            price_usd: 4210,
            currency: "USD",
            refundable: true,
            notes: []
          }],
          hotel_offers: [],
          itinerary: [],
          policy_checks: ["Risk level: high."],
          savings_suggestions: [],
          created_at: "2026-05-16T00:00:00Z"
        }]}
      />
    );

    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Pending approvals")).toBeInTheDocument();
    expect(screen.getAllByText("$4.2K").length).toBeGreaterThan(0);
  });
});
