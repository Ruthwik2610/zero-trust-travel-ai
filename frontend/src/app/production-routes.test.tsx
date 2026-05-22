import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RequestPage from "./requests/[id]/page";
import ItineraryPage from "./itineraries/[id]/page";
import TravelersPage from "./travelers/page";
import TravelerDossierPage from "./travelers/[id]/page";
import PolicyPage from "./policy/page";
import PolicyDetailPage from "./policy/[id]/page";
import PolicyReviewPage from "./policy/[id]/review/page";
import PolicyActivityPage from "./policy/activity/page";
import { listPolicyActivity } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getStoredAuthContext: vi.fn(() => ({
    email: "demo.agent@unipro.com",
    role: "travel_manager",
    scopes: ["travel:plan", "admin:summary", "policy:read"],
    department: "travel_ops",
    manager_scope: [],
    token_expires_at: Math.floor(Date.now() / 1000) + 900,
    user_id: "usr_agent"
  })),
  listCorporateRequests: vi.fn(() => Promise.resolve([])),
  getCorporateAdminSummary: vi.fn(() => Promise.resolve({
    totalRequests: 0,
    newRequests: 0,
    pendingApprovals: 0,
    missingInfo: 0,
    visaIssues: 0,
    finalizedItineraries: 0,
    averageHandlingTimeHours: 0,
    commonDestinations: []
  })),
  listTravelers: vi.fn(() => Promise.resolve([])),
  getTraveler: vi.fn(() => Promise.resolve(null)),
  listPolicies: vi.fn(() => Promise.resolve([])),
  getPolicy: vi.fn(() => Promise.resolve(null)),
  listPolicyVersions: vi.fn(() => Promise.resolve([])),
  listPolicyActivity: vi.fn(() => Promise.resolve([]))
}));

describe("production command center routes", () => {
  it("renders request, itinerary, traveler, and policy routes as native app screens", async () => {
    const pages = [
      [await RequestPage({ params: Promise.resolve({ id: "corp_req_1" }) }), "Request Workspace"],
      [await ItineraryPage({ params: Promise.resolve({ id: "corp_req_1" }) }), "Itinerary Builder"],
      [<TravelersPage />, "Traveler Roster"],
      [await TravelerDossierPage({ params: Promise.resolve({ id: "traveler_1" }) }), "Traveler Dossier"],
      [<PolicyPage />, "Policy Center"],
      [await PolicyDetailPage({ params: Promise.resolve({ id: "policy_1" }) }), "Policy Center"],
      [await PolicyReviewPage({ params: Promise.resolve({ id: "policy_1" }) }), "Policy Review Dashboard"],
      [<PolicyActivityPage />, "Policy Activity Archive"]
    ] as const;

    for (const [node, heading] of pages) {
      const { unmount } = render(node);
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
      unmount();
    }
  });

  it("exports policy activity archive rows as CSV", async () => {
    vi.mocked(listPolicyActivity).mockResolvedValue([
      {
        id: "activity_1",
        policy_id: "policy_global_travel_2024",
        revision_id: "rev_1",
        actor: "policy.manager@unipro.com",
        activity: "Approved policy revision",
        status: "Approved",
        created_at: "2026-05-22T00:00:00.000Z"
      }
    ]);
    const objectUrl = "blob:policy-activity";
    const createObjectUrl = vi.fn(() => objectUrl);
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrl, configurable: true });

    render(<PolicyActivityPage />);

    expect(await screen.findByText("Approved policy revision")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    });
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
  });
});
