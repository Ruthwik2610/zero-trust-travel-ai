import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard, ItineraryBuilderScreen, LoginScreen, RequestWorkspaceScreen, TravelerDashboard, TravelerDossierScreen } from "../TravelAppScreens";
import {
  createCorporateRequest,
  demoLogin,
  downloadCorporateExcelTemplate,
  downloadCorporateRequestExcel,
  finalizeCorporateRequest,
  generateCorporateTravelPlan,
  getTraveler,
  getCorporateAdminSummary,
  listCorporateRequests,
  sendCorporateRequestNotification,
  updateCorporateRequest,
  uploadCorporateRequests
} from "@/lib/api";
import type { CorporateAdminSummary, CorporateTravelRequest, TravelerProfile } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  createCorporateRequest: vi.fn(),
  demoLogin: vi.fn(),
  downloadCorporateExcelTemplate: vi.fn(),
  downloadCorporateRequestExcel: vi.fn(),
  finalizeCorporateRequest: vi.fn(),
  generateCorporateTravelPlan: vi.fn(),
  getTraveler: vi.fn(),
  getCorporateAdminSummary: vi.fn(),
  getStoredAuthContext: vi.fn(() => {
    const raw = window.localStorage.getItem("travel_ai_auth_context");
    return raw ? JSON.parse(raw) : null;
  }),
  listCorporateRequests: vi.fn(),
  sendCorporateRequestNotification: vi.fn(),
  storeAuthSession: vi.fn((session) => {
    window.localStorage.setItem("travel_ai_api_token", session.access_token);
    window.localStorage.setItem("travel_ai_auth_context", JSON.stringify(session.user));
    window.localStorage.setItem("travel_ai_user_email", session.user.email);
  }),
  updateCorporateRequest: vi.fn(),
  uploadCorporateRequests: vi.fn()
}));

const sampleRequest: CorporateTravelRequest = {
  id: "TR-2026-9001",
  travellerName: "Vikram Rao",
  travellerEmail: "vikram.rao@acme.com",
  company: "Acme Infrastructure",
  origin: "Hyderabad",
  destination: "Johannesburg",
  departDate: "2026-06-10",
  returnDate: "2026-06-17",
  purpose: "Client meetings",
  preferences: "Aisle seat, hotel close to office",
  budgetAmount: 150000,
  budgetCurrency: "INR",
  specialRequests: "Vegetarian meals",
  status: "pending_approval",
  visaStatus: "clear",
  budgetStatus: "attention",
  approvalStatus: "Required",
  lastUpdated: "2026-05-19T08:45:00.000Z",
  originalRequest: "Plan Hyderabad to Johannesburg for client meetings.",
  aiSummary: "AI summary prepared for Johannesburg.",
  readinessCheck: "Visa valid. Passport profile present.",
  budgetPolicyCheck: "Plan is close to the INR 1.5 lakh target.",
  recommendedPlans: [
    {
      id: "plan-a",
      name: "Policy Fit",
      flightSummary: "Qatar one-stop flight",
      hotelSummary: "Sandton hotel near office",
      totalAmount: 143800,
      currency: "INR",
      policyFit: "Inside budget",
      tradeoffs: "Best balance of cost and timing.",
      selected: true
    },
    {
      id: "plan-b",
      name: "Lowest Cost",
      flightSummary: "Longer one-stop flight",
      hotelSummary: "Rosebank value hotel",
      totalAmount: 126900,
      currency: "INR",
      policyFit: "Inside policy",
      tradeoffs: "Cheaper but farther from office."
    },
    {
      id: "plan-c",
      name: "Fastest Comfortable",
      flightSummary: "Fastest one-stop route",
      hotelSummary: "Premium Sandton hotel",
      totalAmount: 168500,
      currency: "INR",
      policyFit: "Approval required",
      tradeoffs: "Faster but over budget."
    }
  ],
  missingInformation: "Confirm airport pickup.",
  customerMessageDraft: "Hi Vikram, I prepared three options.",
  finalItineraryDraft: "Draft itinerary for Vikram. This is not a booking confirmation.",
  finalApproved: false
};

const generatedRequest: CorporateTravelRequest = {
  ...sampleRequest,
  aiSummary: "Generated complete travel plan for Vikram.",
  readinessCheck: "Visa, passport, meal, and pickup checks are captured.",
  budgetPolicyCheck: "Recommended plan stays within INR 1.5 lakh.",
  missingInformation: "Confirm mobile number for pickup.",
  customerMessageDraft: "Hi Vikram, the recommended plan is ready for review.",
  finalItineraryDraft: "Final itinerary draft after agent generation.",
  status: "planning"
};

const missingInfoRequest: CorporateTravelRequest = {
  ...sampleRequest,
  id: "TR-2026-9002",
  travellerName: "Anika Shah",
  travellerEmail: "anika.shah@northstar.com",
  company: "Northstar Energy",
  origin: "Delhi",
  destination: "Singapore",
  departDate: "2026-06-24",
  returnDate: "2026-06-28",
  status: "missing_info",
  visaStatus: "pending",
  budgetStatus: "clear",
  approvalStatus: "Not Required",
  missingInformation: "Passport expiry and mobile number required.",
  lastUpdated: "2026-05-19T09:15:00.000Z"
};

const finalizedRequest: CorporateTravelRequest = {
  ...sampleRequest,
  id: "TR-2026-9003",
  travellerName: "Mira Kapoor",
  travellerEmail: "mira.kapoor@acme.com",
  destination: "Berlin",
  status: "finalized",
  visaStatus: "clear",
  budgetStatus: "clear",
  approvalStatus: "Received",
  finalApproved: true,
  lastUpdated: "2026-05-19T10:45:00.000Z"
};

const adminSummary: CorporateAdminSummary = {
  totalRequests: 12,
  newRequests: 3,
  pendingApprovals: 4,
  missingInfo: 2,
  visaIssues: 1,
  finalizedItineraries: 5,
  averageHandlingTimeHours: 3.2,
  commonDestinations: [
    { destination: "Johannesburg", count: 5 },
    { destination: "Berlin", count: 3 }
  ]
};

const documentUpdateTraveler: TravelerProfile = {
  id: "traveler_anika",
  name: "Anika Shah",
  email: "anika.shah@northstar.com",
  company: "Northstar Energy",
  department: "Finance",
  vip_level: null,
  status: "Missing Passport",
  location: "Delhi",
  seat_preference: "Window",
  meal_preference: "Vegetarian",
  hotel_preference: "Near client office",
  policy_notes: ["Passport must be collected before final itinerary."],
  loyalty_programs: [{ provider: "United MileagePlus", tier: "Gold", account_ref: "On file" }],
  documents: [{ document_type: "passport", label: "Passport", status: "Missing", redacted_value: null }],
  recent_trips: ["Delhi to Singapore"],
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z"
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(demoLogin).mockResolvedValue({
    access_token: "demo-token",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 900,
    user: {
      user_id: "usr_agent",
      email: "demo.agent@unipro.com",
      role: "travel_manager",
      department: "travel_ops",
      scopes: ["admin:summary", "travel:plan"],
      manager_scope: [],
      token_expires_at: Math.floor(Date.now() / 1000) + 900
    }
  });
  vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);
  vi.mocked(createCorporateRequest).mockImplementation(async (payload) => ({
    ...sampleRequest,
    ...payload,
    id: "TR-2026-9010",
    originalRequest: `${payload.travellerName} needs ${payload.origin} to ${payload.destination}.`
  }));
  vi.mocked(generateCorporateTravelPlan).mockResolvedValue(generatedRequest);
  vi.mocked(getTraveler).mockResolvedValue(documentUpdateTraveler);
  vi.mocked(updateCorporateRequest).mockResolvedValue(generatedRequest);
  vi.mocked(finalizeCorporateRequest).mockImplementation(async (_id, payload) => ({
    ...generatedRequest,
    ...payload,
    finalApproved: true,
    status: "finalized"
  }));
  vi.mocked(getCorporateAdminSummary).mockResolvedValue(adminSummary);
  vi.mocked(sendCorporateRequestNotification).mockResolvedValue({
    id: "email_event_1",
    request_id: "TR-2026-9001",
    kind: "approval_request",
    provider: "resend",
    status: "sent",
    to: ["vikram.rao@acme.com"],
    subject: "Approval requested",
    provider_message_id: "email_123",
    safe_message: "Email accepted by Resend.",
    created_at: "2026-05-22T00:00:00.000Z"
  });
  vi.mocked(downloadCorporateExcelTemplate).mockResolvedValue(new Blob(["template"]));
  vi.mocked(downloadCorporateRequestExcel).mockResolvedValue(new Blob(["itinerary"]));
  vi.mocked(uploadCorporateRequests).mockResolvedValue({
    totalRows: 4,
    createdRequests: 3,
    skippedRows: 1,
    requests: [{ ...sampleRequest, id: "TR-2026-9020" }]
  });
});

describe("AI Corporate Travel Planning Assistant MVP", () => {
  it("renders demo-friendly login with only agent and admin roles", async () => {
    render(<LoginScreen />);

    expect(screen.getByText("Unipro Travel Operations")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Travel Agent/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Research Intake/i })).toBeNull();
    expect(screen.queryByText("Research")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Application Admin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(demoLogin).toHaveBeenCalledWith("admin.user@unipro.com");
      expect(window.localStorage.getItem("travel_ai_selected_role")).toBe("admin");
      expect(window.location.pathname).toBe("/admin");
    });
  });

  it("renders the agent dashboard request list with required operational columns", async () => {
    render(<TravelerDashboard />);

    expect(await screen.findByText("Agent Operations Dashboard")).toBeTruthy();
    expect(screen.getByText("Request Queue")).toBeTruthy();
    expect(screen.getAllByText("Request Details").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: /AI Planning Assistant/i })).toBeTruthy();
    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vikram Rao").length).toBeGreaterThan(1);
    expect(screen.getByText("Traveller")).toBeTruthy();
    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText("Destination")).toBeTruthy();
    expect(screen.getByText("Travel dates")).toBeTruthy();
    expect(screen.getByText("Visa")).toBeTruthy();
    expect(screen.getByText("Budget")).toBeTruthy();
    expect(screen.getByText("Approval")).toBeTruthy();
    expect(screen.getAllByText("Hyderabad → Johannesburg").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect(listCorporateRequests).toHaveBeenCalledTimes(1);
  });

  it("defaults the dashboard to a priority board with workflow stage columns", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([missingInfoRequest, generatedRequest, finalizedRequest]);

    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Priority Board" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Priority Board" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Waiting For Information/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /In Process/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Completed/i })).toBeTruthy();
    expect(screen.getAllByText("Passport expiry and mobile number required.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ask for info").length).toBeGreaterThan(0);
    expect(screen.getByText("Review plan")).toBeTruthy();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("keeps dashboard cards scan-friendly with route, dates, owner, freshness, and priority reasons", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([missingInfoRequest]);

    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9002")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anika Shah").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Northstar Energy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Delhi → Singapore").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jun 24, 2026 - Jun 28, 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visa issue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing info").length).toBeGreaterThan(0);
    expect(screen.getByText("Assigned to travel ops")).toBeTruthy();
    expect(screen.getByText(/Updated/)).toBeTruthy();
    expect(screen.queryByText("Final itinerary draft after agent generation.")).toBeNull();
  });

  it("separates the request workspace into focused tabs", async () => {
    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Missing Info" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Policy & Budget" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Documents & Visa" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Approval & Finalize" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Plan" }));
    expect(screen.getByText("Policy Fit")).toBeTruthy();
    expect(screen.queryByLabelText("Approval status")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Approval & Finalize" }));
    expect(screen.getByLabelText("Approval status")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate Final Itinerary/i })).toBeTruthy();
  });

  it("uses only live queue requests without sample filler or fake totals", async () => {
    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Agent Operations Dashboard" })).toBeTruthy();
    expect(screen.queryByText("Michael Chen")).toBeNull();
    expect(screen.queryByText("Sarah Johnson")).toBeNull();
    expect(screen.getByText("Showing 1 to 1 of 1 requests")).toBeTruthy();
    expect(screen.queryByText("56")).toBeNull();
  });

  it("hides policy and admin navigation when the signed-in agent lacks those scopes", async () => {
    window.localStorage.setItem("travel_ai_auth_context", JSON.stringify({
      user_id: "usr_limited_agent",
      email: "limited.agent@unipro.com",
      role: "travel_manager",
      department: "travel_ops",
      scopes: ["travel:plan"],
      manager_scope: [],
      token_expires_at: Math.floor(Date.now() / 1000) + 900
    }));

    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Agent Operations Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Agent Operations/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Requests$/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Policy$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Application Admin/i })).toBeNull();
  });

  it("lets an agent create a travel request from the dashboard", async () => {
    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Agent Operations Dashboard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /New Request/i }));
    fireEvent.change(screen.getByLabelText("Traveller name"), { target: { value: "Anika Shah" } });
    fireEvent.change(screen.getByLabelText("Traveller email"), { target: { value: "anika.shah@example.com" } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Northstar Energy" } });
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Delhi" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Singapore" } });
    fireEvent.change(screen.getByLabelText("Depart date"), { target: { value: "2026-06-24" } });
    fireEvent.change(screen.getByLabelText("Return date"), { target: { value: "2026-06-28" } });
    fireEvent.change(screen.getByLabelText("Travel purpose"), { target: { value: "Regional leadership meeting" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Request/i }));

    await waitFor(() => {
      expect(createCorporateRequest).toHaveBeenCalledWith(expect.objectContaining({
        travellerName: "Anika Shah",
        company: "Northstar Energy",
        destination: "Singapore",
        budgetAmount: 150000
      }));
    });
    expect((await screen.findAllByText("TR-2026-9010")).length).toBeGreaterThan(0);
  });

  it("generates the request detail plan and renders editable MVP sections", async () => {
    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Request Details")).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: /Generate AI Plan/i }));

    expect((await screen.findAllByText("Confirm mobile number for pickup.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Plan" }));
    expect(screen.getByLabelText("AI Summary")).toBeTruthy();
    expect(screen.getByLabelText("Customer Message Draft")).toBeTruthy();
    expect(screen.getByText("Policy Fit")).toBeTruthy();
    expect(generateCorporateTravelPlan).toHaveBeenCalledWith("TR-2026-9001");
  });

  it("lets the agent save a note from the request details panel", async () => {
    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Plan" }));
    fireEvent.change(await screen.findByLabelText("AI Summary"), { target: { value: "Agent edited plan summary." } });
    fireEvent.click(await screen.findByRole("button", { name: /Save Edits/i }));

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        aiSummary: "Agent edited plan summary.",
        recommendedPlans: expect.arrayContaining([
          expect.objectContaining({ name: "Policy Fit" })
        ])
      }));
    });
  });

  it("lets the agent mark approval received, generate final itinerary, and download export", async () => {
    const objectUrl = "blob:itinerary";
    const createObjectUrl = vi.fn(() => objectUrl);
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrl, configurable: true });
    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Approval & Finalize" }));
    fireEvent.change(await screen.findByLabelText("Approval status"), { target: { value: "Received" } });
    fireEvent.click(await screen.findByRole("button", { name: /Generate Final Itinerary/i }));

    await waitFor(() => {
      expect(finalizeCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        agent_reviewed: true,
        approval_status: "Received"
      }));
    });
    fireEvent.click(await screen.findByRole("button", { name: /Download Export/i }));
    await waitFor(() => {
      expect(downloadCorporateRequestExcel).toHaveBeenCalledWith("TR-2026-9001");
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
  });

  it("shows a finalization gate message when export is blocked", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{ ...finalizedRequest, status: "finalized", finalApproved: true }]);
    vi.mocked(downloadCorporateRequestExcel).mockRejectedValue(new Error("Final itinerary is not ready: stack trace"));

    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9003")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Approval & Finalize" }));
    fireEvent.click(await screen.findByRole("button", { name: /Download Export/i }));

    expect(await screen.findByText("Final itinerary is not ready. Complete approval and finalization before export.")).toBeTruthy();
    expect(screen.queryByText(/stack trace/i)).toBeNull();
  });

  it("uses contextual planning chat without claiming a booking", async () => {
    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /AI Planning Assistant/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Compare policy-compliant options/i }));

    expect((await screen.findAllByText(/Compare policy-compliant options/i)).length).toBeGreaterThan(1);
    expect(await screen.findByText(/Here are the best policy fit options/i)).toBeTruthy();
    expect(screen.getAllByText(/AI Planning Assistant/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/booked/i)).toBeNull();
  });

  it("flags itinerary options that require manual provider sourcing", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([
      {
        ...generatedRequest,
        id: "TR-2026-9100",
        recommendedPlans: [
          {
            ...generatedRequest.recommendedPlans[0],
            flightSummary: "Manual sourcing required for Duffel flight inventory.",
            hotelSummary: "Manual sourcing required for hotel availability.",
            totalAmount: 0,
            policyFit: "Needs manual review"
          }
        ]
      }
    ]);

    render(<ItineraryBuilderScreen requestId="TR-2026-9100" />);

    expect(await screen.findByRole("heading", { name: "Itinerary Builder" })).toBeTruthy();
    expect(await screen.findByText("Manual Sourcing Required")).toBeTruthy();
    expect(screen.getByText("Do not finalize until an agent attaches verified provider options.")).toBeTruthy();
  });

  it("shows a safe manual follow-up state when approval email cannot be sent", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);
    vi.mocked(sendCorporateRequestNotification).mockRejectedValue(new Error("RESEND_API_KEY rejected for token secret"));

    render(<RequestWorkspaceScreen requestId="TR-2026-9001" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send Approval Email/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Approval email could not be sent. Continue with manual follow-up.");
    expect(screen.queryByText(/RESEND_API_KEY/)).toBeNull();
  });

  it("sends final itinerary emails with the itinerary attachment from the request workspace", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([finalizedRequest]);
    vi.mocked(sendCorporateRequestNotification).mockResolvedValue({
      id: "email_event_final_itinerary",
      request_id: "TR-2026-9003",
      kind: "final_itinerary",
      provider: "resend",
      status: "sent",
      to: ["mira.kapoor@acme.com"],
      subject: "Final itinerary",
      provider_message_id: "email_final_123",
      safe_message: "Final itinerary email accepted by Resend.",
      created_at: "2026-05-22T00:00:00.000Z"
    });

    render(<RequestWorkspaceScreen requestId="TR-2026-9003" />);

    expect(await screen.findByText("Mira Kapoor")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send Final Itinerary" }));

    await waitFor(() => {
      expect(sendCorporateRequestNotification).toHaveBeenCalledWith("TR-2026-9003", {
        kind: "final_itinerary",
        to: ["mira.kapoor@acme.com"],
        note: "Final itinerary after agent review and approval. This is not a booking confirmation.",
        attach_itinerary: true
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Final itinerary email accepted by Resend.");
  });

  it("sends document update emails from the traveler dossier", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([
      {
        ...sampleRequest,
        id: "TR-2026-9200",
        travellerName: "Anika Shah",
        travellerEmail: "anika.shah@northstar.com",
        company: "Northstar Energy"
      }
    ]);
    vi.mocked(sendCorporateRequestNotification).mockResolvedValue({
      id: "email_event_document_update",
      request_id: "TR-2026-9200",
      kind: "document_update",
      provider: "resend",
      status: "sent",
      to: ["anika.shah@northstar.com"],
      subject: "Document update needed",
      provider_message_id: "email_document_123",
      safe_message: "Document update email accepted by Resend.",
      created_at: "2026-05-22T00:00:00.000Z"
    });

    render(<TravelerDossierScreen travelerId="traveler_anika" />);

    expect(await screen.findByText("Anika Shah • Northstar Energy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send Document Update" }));

    await waitFor(() => {
      expect(sendCorporateRequestNotification).toHaveBeenCalledWith("TR-2026-9200", {
        kind: "document_update",
        to: ["anika.shah@northstar.com"],
        note: "Please update missing or expiring travel documents before itinerary finalization.",
        attach_itinerary: false
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Document update email accepted by Resend.");
  });

  it("renders admin metrics and uploads Excel files to the backend route", async () => {
    window.localStorage.setItem("travel_ai_selected_role", "admin");
    render(<AdminDashboard />);

    expect(await screen.findByRole("heading", { name: "Application Admin" })).toBeTruthy();
    expect(screen.getByText("Total Requests")).toBeTruthy();
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("Pending Approvals")).toBeTruthy();
    expect(screen.getByText("Average Handling Time")).toBeTruthy();
    expect(screen.getByText("Johannesburg")).toBeTruthy();
    expect(screen.queryByText("Client Data Updates")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText("Upload Company Data")).toBeTruthy();

    const objectUrl = "blob:template";
    const createObjectUrl = vi.fn(() => objectUrl);
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrl, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: /Download Template/i }));
    await waitFor(() => {
      expect(downloadCorporateExcelTemplate).toHaveBeenCalledTimes(1);
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);

    const file = new File(["traveller,company"], "requests.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    fireEvent.change(screen.getByLabelText(/Select Excel file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Upload Requests/i }));

    await waitFor(() => {
      expect(uploadCorporateRequests).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText(/created from/i)).toBeTruthy();
    expect(await screen.findByText("TR-2026-9020")).toBeTruthy();
  });

  it("keeps the admin screen restricted for non-admin selected role", async () => {
    vi.mocked(demoLogin).mockResolvedValueOnce({
      access_token: "traveler-token",
      token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 900,
      user: {
        user_id: "usr_traveler",
        email: "traveler@unipro.com",
        role: "traveler",
        department: "sales",
        scopes: ["travel:plan"],
        manager_scope: [],
        token_expires_at: Math.floor(Date.now() / 1000) + 900
      }
    });
    render(<AdminDashboard />);

    expect(await screen.findByText("Admin access is restricted.")).toBeTruthy();
    expect(getCorporateAdminSummary).not.toHaveBeenCalled();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
});
