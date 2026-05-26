import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard, AuditArchiveScreen, ClientReviewPortalScreen, ItineraryBuilderScreen, LoginScreen, RequestWorkspaceScreen, TravelerDashboard, TravelerDossierScreen, TravelerRosterScreen, TripPlannerScreen } from "../TravelAppScreens";
import {
  chatWithAssistant,
  clearAuthSession,
  createCorporateRequest,
  demoLogin,
  deleteCorporateRequest,
  downloadClientRequestFormPdf,
  downloadCorporateExcelTemplate,
  downloadCorporateRequestExcel,
  downloadCorporateRequestPdf,
  finalizeCorporateRequest,
  generateCorporateTravelPlan,
  getAuditEvents,
  getClientReview,
  getEmailEvents,
  getTraveler,
  getCorporateAdminSummary,
  listCompanyPipelineStatuses,
  listCorporateRequests,
  listTravelers,
  saveTravelerProfile,
  sendCorporateRequestNotification,
  submitClientReview,
  updateCorporateCriticalIssue,
  updateCorporateRequest,
  uploadCompanyPolicyPdf,
  uploadCorporateRequests
} from "@/lib/api";
import type { AuthContext, CorporateAdminSummary, CorporateTravelRequest, TravelerProfile } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  chatWithAssistant: vi.fn(),
  clearAuthSession: vi.fn(() => {
    window.localStorage.removeItem("travel_ai_api_token");
    window.localStorage.removeItem("travel_ai_auth_context");
  }),
  createCorporateRequest: vi.fn(),
  deleteCorporateRequest: vi.fn(),
  demoLogin: vi.fn(),
  downloadClientRequestFormPdf: vi.fn(),
  downloadCorporateExcelTemplate: vi.fn(),
  downloadCorporateRequestExcel: vi.fn(),
  downloadCorporateRequestPdf: vi.fn(),
  finalizeCorporateRequest: vi.fn(),
  generateCorporateTravelPlan: vi.fn(),
  getAuditEvents: vi.fn(),
  getClientReview: vi.fn(),
  getEmailEvents: vi.fn(),
  getTraveler: vi.fn(),
  getCorporateAdminSummary: vi.fn(),
  getStoredAuthContext: vi.fn(() => {
    const raw = window.localStorage.getItem("travel_ai_auth_context");
    return raw ? JSON.parse(raw) : null;
  }),
  listTravelers: vi.fn(),
  listCompanyPipelineStatuses: vi.fn(),
  listCorporateRequests: vi.fn(),
  sendCorporateRequestNotification: vi.fn(),
  submitClientReview: vi.fn(),
  saveTravelerProfile: vi.fn(),
  storeAuthSession: vi.fn((session) => {
    window.localStorage.setItem("travel_ai_api_token", session.access_token);
    window.localStorage.setItem("travel_ai_auth_context", JSON.stringify(session.user));
  }),
  updateCorporateRequest: vi.fn(),
  updateCorporateCriticalIssue: vi.fn(),
  uploadCompanyPolicyPdf: vi.fn(),
  uploadCorporateRequests: vi.fn()
}));

const sampleRequest: CorporateTravelRequest = {
  id: "TR-2026-9001",
  travellerName: "Vikram Rao",
  travellerEmail: "vikram.rao@acme.com",
  travellerNationality: "Indian",
  company: "Acme Infrastructure",
  origin: "Hyderabad",
  destination: "Johannesburg",
  departDate: "2026-06-10",
  returnDate: "2026-06-17",
  includeOutboundFlight: true,
  includeReturnFlight: true,
  includeHotel: true,
  purpose: "Client meetings",
  preferences: "Aisle seat, hotel close to office",
  budgetAmount: 150000,
  budgetCurrency: "INR",
  specialRequests: "Vegetarian meals",
  criticalIssue: "",
  criticalIssueStatus: "None",
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
      flightOfferId: "off_qatar_policy",
      groundTransferOfferId: "transfer_standard",
      flightSummary: "Qatar one-stop flight",
      hotelSummary: "Sandton hotel near office",
      transferSummary: "Standard airport transfer",
      totalAmount: 143800,
      currency: "INR",
      policyFit: "Inside budget",
      tradeoffs: "Best balance of cost and timing.",
      selected: true
    },
    {
      id: "plan-b",
      name: "Lowest Cost",
      flightOfferId: "off_lowest_cost",
      groundTransferOfferId: "transfer_standard",
      flightSummary: "Longer one-stop flight",
      hotelSummary: "Rosebank value hotel",
      transferSummary: "Standard airport transfer",
      totalAmount: 126900,
      currency: "INR",
      policyFit: "Inside policy",
      tradeoffs: "Cheaper but farther from office."
    },
    {
      id: "plan-c",
      name: "Fastest Comfortable",
      flightOfferId: "off_fastest",
      groundTransferOfferId: "transfer_executive",
      flightSummary: "Fastest one-stop route",
      hotelSummary: "Premium Sandton hotel",
      transferSummary: "Executive airport transfer",
      totalAmount: 168500,
      currency: "INR",
      policyFit: "Approval required",
      tradeoffs: "Faster but over budget."
    }
  ],
  flightOffers: [
    {
      id: "off_qatar_policy",
      provider: "duffel-api/qr",
      airline: "Qatar Airways",
      summary: "Qatar Airways · HYD -> JNB",
      totalAmount: 92000,
      currency: "INR",
      outbound: "HYD -> JNB · Qatar Airways · 1 stop",
      returnLeg: "JNB -> HYD · Qatar Airways · 1 stop",
      cabin: "economy",
      expiresAt: "2026-05-22T12:00:00Z",
      source: "duffel",
      notes: ["Offer ID: off_qatar_policy"],
      selected: true
    },
    {
      id: "off_lowest_cost",
      provider: "synthetic-duffel/fastest",
      airline: "IndiGo + partner",
      summary: "Lowest practical fare",
      totalAmount: 76000,
      currency: "INR",
      outbound: "HYD -> JNB · 2 stops",
      returnLeg: "JNB -> HYD · 2 stops",
      cabin: "economy",
      source: "synthetic",
      notes: []
    }
  ],
  selectedFlightOfferId: "off_qatar_policy",
  hotelOffers: [
    {
      id: "hotel_sandton_business",
      provider: "booking.com-demand-api",
      name: "Sandton Business Hotel",
      summary: "4-star Sandton hotel near client office.",
      totalAmount: 51800,
      currency: "INR",
      address: "Sandton, Johannesburg",
      starRating: 4,
      checkIn: "2026-06-10",
      checkOut: "2026-06-17",
      checkInStartsAt: "15:00",
      checkoutTime: "11:00",
      roomNotes: "Standard corporate room",
      cancellationNotes: "Verify before confirmation",
      unsentSpecialRequests: ["Vegetarian meals"],
      nights: 7,
      rooms: 1,
      guests: 1,
      imageUrl: "/travel-media/hotel-business.png",
      source: "booking",
      notes: ["Near office"],
      selected: true
    },
    {
      id: "hotel_rosebank_value",
      provider: "synthetic-booking/office",
      name: "Rosebank Value Hotel",
      summary: "Lower-cost planning hotel with longer commute.",
      totalAmount: 42000,
      currency: "INR",
      address: "Rosebank, Johannesburg",
      starRating: 4,
      checkIn: "2026-06-10",
      checkOut: "2026-06-17",
      checkInStartsAt: "15:00",
      checkoutTime: "11:00",
      roomNotes: "Standard corporate room",
      cancellationNotes: "Verify before confirmation",
      unsentSpecialRequests: [],
      nights: 7,
      rooms: 1,
      guests: 1,
      imageUrl: "/travel-media/hotel-city.png",
      source: "synthetic",
      notes: []
    }
  ],
  selectedHotelOfferId: "hotel_sandton_business",
  groundTransferOffers: [
    {
      id: "transfer_standard",
      provider: "Johannesburg Airport Cars",
      offerId: null,
      pickupAirportCode: "JNB",
      pickupTime: "2026-06-10T09:00:00",
      dropoffLabel: "Sandton Business Hotel",
      dropoffAddress: "Sandton, Johannesburg",
      serviceType: "PRIVATE",
      vehicleType: "Business sedan",
      passengers: 1,
      baggage: "1 checked bag and 1 carry-on per traveler",
      totalAmount: 7200,
      currency: "INR",
      cancellationNotes: "Free cancellation assumed until 24 hours before pickup; verify before confirmation.",
      source: "synthetic",
      notes: ["No transfer order created"],
      selected: true
    },
    {
      id: "transfer_executive",
      provider: "Corporate Chauffeur Desk",
      pickupAirportCode: "JNB",
      pickupTime: "2026-06-10T09:30:00",
      dropoffLabel: "Sandton Business Hotel",
      dropoffAddress: "Sandton, Johannesburg",
      serviceType: "PRIVATE",
      vehicleType: "Executive SUV",
      passengers: 1,
      baggage: "Extra luggage buffer",
      totalAmount: 10800,
      currency: "INR",
      cancellationNotes: "Manual confirmation required",
      source: "synthetic",
      notes: []
    }
  ],
  selectedGroundTransferOfferId: "transfer_standard",
  clientReview: {
    status: "Sent",
    reviewUrl: "http://localhost:3100/review/test-token",
    selectedOptionIndex: null,
    editRequestText: null,
    revisionRound: 0,
    changeSummary: null,
    expiresAt: "2026-06-01T00:00:00Z",
    sentAt: "2026-05-25T00:00:00Z",
    submittedAt: null
  },
  clientReviewHistory: [
    {
      id: "review_evt_1",
      action: "sent",
      revisionRound: 0,
      selectedOptionIndex: null,
      editRequestText: null,
      changeSummary: null,
      createdAt: "2026-05-25T00:00:00Z"
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

function authContextFor(kind: "agent" | "admin"): AuthContext {
  const token_expires_at = Math.floor(Date.now() / 1000) + 900;
  if (kind === "admin") {
    return {
      user_id: "usr_admin",
      email: "admin.user@unipro.com",
      role: "traveler",
      department: "travel_ops",
      scopes: ["admin:summary", "travel:plan", "policy:read"],
      manager_scope: ["travel_ops"],
      token_expires_at
    };
  }
  return {
    user_id: "usr_agent",
    email: "demo.agent@unipro.com",
    role: "traveler",
    department: "travel_ops",
    scopes: ["travel:plan", "policy:read"],
    manager_scope: [],
    token_expires_at
  };
}

function authSessionFor(kind: "agent" | "admin") {
  const user = authContextFor(kind);
  return {
    access_token: `${kind}-token`,
    token_type: "bearer" as const,
    expires_at: user.token_expires_at,
    user
  };
}

function storeAdminWorkspace() {
  window.localStorage.setItem("travel_ai_selected_role", "admin");
  window.localStorage.setItem("travel_ai_auth_context", JSON.stringify(authContextFor("admin")));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem("travel_ai_api_token", "agent-token");
  window.localStorage.setItem("travel_ai_auth_context", JSON.stringify(authContextFor("agent")));
  vi.mocked(demoLogin).mockResolvedValue(authSessionFor("agent"));
  vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);
  vi.mocked(createCorporateRequest).mockImplementation(async (payload) => ({
    ...sampleRequest,
    ...payload,
    id: "TR-2026-9010",
    originalRequest: `${payload.travellerName} needs ${payload.origin} to ${payload.destination}.`
  }));
  vi.mocked(generateCorporateTravelPlan).mockResolvedValue(generatedRequest);
  vi.mocked(getAuditEvents).mockResolvedValue([]);
  vi.mocked(getEmailEvents).mockResolvedValue([]);
  vi.mocked(getTraveler).mockResolvedValue(documentUpdateTraveler);
  vi.mocked(listTravelers).mockResolvedValue([documentUpdateTraveler]);
  vi.mocked(listCompanyPipelineStatuses).mockResolvedValue([
    {
      companyName: "Acme Infrastructure",
      travelerCount: 2,
      travelerListStatus: "Updated",
      policyStatus: "Uploaded",
      policyCount: 1,
      visaRecordCount: 2,
      historyRowCount: 4
    }
  ]);
  vi.mocked(uploadCompanyPolicyPdf).mockResolvedValue({
    companyName: "Acme Infrastructure",
    policyCount: 1,
    rules: ["Allowed cabins: economy,premium_economy"]
  });
  vi.mocked(updateCorporateRequest).mockImplementation(async (_id, payload) => ({
    ...generatedRequest,
    ...payload,
    lastUpdated: "2026-05-20T13:30:00.000Z"
  }));
  vi.mocked(updateCorporateCriticalIssue).mockImplementation(async (id, issue, status = "Urgent") => ({
    ...sampleRequest,
    id,
    criticalIssue: issue || "",
    criticalIssueStatus: status
  }));
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
  vi.mocked(downloadClientRequestFormPdf).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  vi.mocked(downloadCorporateRequestExcel).mockResolvedValue(new Blob(["itinerary"]));
  vi.mocked(downloadCorporateRequestPdf).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  vi.mocked(saveTravelerProfile).mockImplementation(async (profile) => profile);
  vi.mocked(chatWithAssistant).mockResolvedValue({
    message: "Live assistant response from the backend. No booking has been made.",
    model: "openrouter/deepseek",
    audit_events: []
  });
  vi.mocked(uploadCorporateRequests).mockResolvedValue({
    totalRows: 4,
    createdRequests: 3,
    skippedRows: 1,
    employeeProfiles: 2,
    requests: [{ ...sampleRequest, id: "TR-2026-9020" }]
  });
});

async function openRequestWorkspace(id = "TR-2026-9001") {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(id, "i") }));
}

describe("AI Corporate Travel Planning Assistant MVP", () => {
  it("renders demo-friendly login with only the travel agent role", async () => {
    render(<LoginScreen />);

    expect(screen.getAllByAltText("Unipro").length).toBeGreaterThan(0);
    expect(screen.getByText("Travel Operations")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Demo Access" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AI-assisted corporate travel planning for travel agents." })).toBeTruthy();
    expect(screen.getByLabelText("Username")).toHaveValue("agent");
    expect(screen.getByLabelText("Password")).toHaveValue("travel-demo-2026");
    expect(screen.queryByLabelText("Account email")).toBeNull();
    expect(screen.queryByText("Travel Agent")).toBeNull();
    expect(screen.queryByRole("button", { name: /Application Admin/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Research Intake/i })).toBeNull();
    expect(screen.queryByText("Research")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue to workspace/i }));

    await waitFor(() => {
      expect(demoLogin).toHaveBeenCalledWith("demo.agent@unipro.com", "travel-demo-2026", "agent");
      expect(window.localStorage.getItem("travel_ai_selected_role")).toBe("agent");
      expect(window.location.pathname).toBe("/dashboard");
    });
  });

  it("renders the travel operations workspace with queue, selected request, and action panel", async () => {
    const { container } = render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    expect(container.querySelector('img[src="/unipro-logo.png"]')).toBeTruthy();
    expect(container.querySelector('img[src="/unipro-full-logo.svg"]')).toBeNull();
    expect(container.querySelector('img[src="/unipro-icon.svg"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "Requests" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Traveler" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Route" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Dates" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Critical Issue" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "AI Planning Assistant" })).toBeNull();
    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vikram Rao").length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "Search requests" })).toBeTruthy();

    await openRequestWorkspace();
    expect(screen.getAllByRole("heading", { name: "Vikram Rao" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Back to Requests/i })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Request context" })).toBeTruthy();
    expect(screen.getAllByText(/Budget ₹150,000/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Missing Info/i })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Flights/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hotel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^4Transfer$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^6Client Review$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Approval & Export/i })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "AI Planning Assistant" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Flights/i }));
    expect(screen.getByRole("button", { name: /Flights/i })).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByText("Qatar Airways").length).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/flight visual/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Next: Select Hotel/i }));
    expect(screen.getByRole("button", { name: /^3Hotel$/i })).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByText("Sandton Business Hotel").length).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/hotel visual/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^4Transfer$/i }));
    expect(screen.getAllByText("Business sedan").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^6Client Review$/i }));
    expect(screen.getByText("Open Client Dashboard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back to Requests/i }));
    expect(screen.getByRole("heading", { name: "Requests" })).toBeTruthy();
    expect(listCorporateRequests).toHaveBeenCalledTimes(1);
  });

  it("renders signed client review options and submits approval", async () => {
    const reviewPayload = {
      requestId: "TR-2026-9001",
      travelerName: "Vikram Rao",
      companyName: "Acme Infrastructure",
      route: "Hyderabad to Johannesburg",
      departDate: "2026-06-10",
      returnDate: "2026-06-17",
      status: "Sent" as const,
      revisionRound: 0,
      expiresAt: "2026-06-01T00:00:00Z",
      submittedAt: null,
      changeSummary: null,
      specialRequestNotice: "Captured special requests have not been sent to the hotel or transfer provider yet: Vegetarian meals",
      options: [
        {
          optionIndex: 1,
          optionName: "Best within budget",
          flightSummary: "Qatar one-stop flight",
          hotelSummary: "Sandton hotel near office",
          transferSummary: "Business sedan airport pickup",
          estimatedCost: 143800,
          currency: "INR",
          policyStatus: "Compliant",
          recommendationReason: "Best balance of cost and timing.",
          pros: ["Lowest estimated total"],
          cons: [],
          flight: {
            id: "off_qatar_policy",
            airline: "Qatar Airways",
            summary: "Qatar Airways · HYD -> JNB",
            outbound: "HYD -> JNB · 1 stop",
            returnLeg: "JNB -> HYD · 1 stop",
            cabin: "economy" as const,
            totalAmount: 92000,
            currency: "INR",
            notes: []
          },
          hotel: {
            id: "hotel_sandton_business",
            name: "Sandton Business Hotel",
            summary: "4-star Sandton hotel near client office.",
            address: "Sandton, Johannesburg",
            checkIn: "2026-06-10",
            checkOut: "2026-06-17",
            checkInStartsAt: "15:00",
            checkoutTime: "11:00",
            roomNotes: "Standard corporate room",
            cancellationNotes: "Verify before confirmation",
            unsentSpecialRequests: ["Vegetarian meals"],
            totalAmount: 51800,
            currency: "INR"
          },
          transfer: {
            id: "transfer_standard",
            pickupAirportCode: "JNB",
            pickupTime: "2026-06-10T09:00:00",
            dropoffLabel: "Sandton Business Hotel",
            dropoffAddress: "Sandton, Johannesburg",
            serviceType: "PRIVATE",
            vehicleType: "Business sedan",
            passengers: 1,
            baggage: "Standard luggage",
            totalAmount: 7200,
            currency: "INR",
            cancellationNotes: "Verify before confirmation",
            notes: []
          }
        },
        {
          optionIndex: 2,
          optionName: "Fastest route",
          flightSummary: "Fastest one-stop route",
          hotelSummary: "Sandton hotel near office",
          transferSummary: "Priority airport pickup",
          estimatedCost: 168500,
          currency: "INR",
          policyStatus: "Needs Approval",
          recommendationReason: "Faster arrival.",
          pros: [],
          cons: [],
          flight: null,
          hotel: null,
          transfer: null
        },
        {
          optionIndex: 3,
          optionName: "Comfort-focused option",
          flightSummary: "Comfort route",
          hotelSummary: "Premium Sandton hotel",
          transferSummary: "Executive airport transfer",
          estimatedCost: 188500,
          currency: "INR",
          policyStatus: "Needs Approval",
          recommendationReason: "More comfort.",
          pros: [],
          cons: [],
          flight: null,
          hotel: null,
          transfer: null
        }
      ],
      history: []
    };
    vi.mocked(getClientReview).mockResolvedValue(reviewPayload);
    vi.mocked(submitClientReview).mockResolvedValue({ ...reviewPayload, status: "Approved", submittedAt: "2026-05-25T10:00:00Z" });

    render(<ClientReviewPortalScreen token="signed-token" />);

    expect(await screen.findByRole("heading", { name: "Vikram Rao" })).toBeTruthy();
    expect(screen.getByText("Business sedan")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Approve Option/i })[0]);

    await waitFor(() => {
      expect(submitClientReview).toHaveBeenCalledWith("signed-token", { action: "approve", selected_option_index: 1 });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Approved. Your final itinerary has been queued for email delivery.");
  });

  it("filters the request queue by search term and stage buttons", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest, missingInfoRequest, finalizedRequest]);

    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    const metrics = screen.getByLabelText("Request metrics");
    expect(within(metrics).getByText("Active Requests")).toBeTruthy();
    expect(within(metrics).getByText("Approval Flags")).toBeTruthy();
    expect(within(metrics).getByText("Visa Issues")).toBeTruthy();
    expect(within(metrics).getByText("2")).toBeTruthy();
    expect(within(metrics).getAllByText("1").length).toBeGreaterThanOrEqual(2);
    fireEvent.change(screen.getByRole("textbox", { name: "Search requests" }), { target: { value: "Johannesburg" } });
    const queueRegion = screen.getByRole("region", { name: "Requests" });
    expect(within(queueRegion).getAllByText("Vikram Rao").length).toBeGreaterThan(0);
    expect(within(queueRegion).queryByText("Mira Kapoor")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Search requests" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Completed/i }));
    expect(within(queueRegion).queryByText("Vikram Rao")).toBeNull();
    expect(within(queueRegion).getAllByText("Mira Kapoor").length).toBeGreaterThan(0);
    expect(screen.getByText("Showing 1 to 1 of 1 requests")).toBeTruthy();
  });

  it("keeps loaded request context compact when source fields are duplicated", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{
      ...sampleRequest,
      preferences: "Vegetarian meal; Hotel near office; Vegetarian meal; Hotel near office",
      readinessCheck: [
        "Passport: Passport: Needs Review Visa: Needs Review Transit: Transit requirements were not verified and need review before ticketing.",
        "Passport expiry was not provided.",
        "Visa requirement needs review because no matching provided visa rule verified the route.",
        "Visa: Passport: Needs Review Visa: Needs Review Transit: Transit requirements were not verified and need review before ticketing."
      ].join(" ")
    }]);

    render(<TravelerDashboard />);
    await openRequestWorkspace();

    const context = screen.getByRole("complementary", { name: "Request context" });
    expect(within(context).getByText("Vegetarian meal; Hotel near office")).toBeTruthy();
    expect(within(context).getByText("Passport: Needs Review · Visa: Needs Review · Transit: Transit requirements were not verified and need review before ticketing")).toBeTruthy();
    expect(within(context).queryByText(/Passport: Passport:/)).toBeNull();
  });

  it("refreshes the live request queue from the backend", async () => {
    vi.mocked(listCorporateRequests)
      .mockResolvedValueOnce([sampleRequest])
      .mockResolvedValueOnce([finalizedRequest]);

    render(<TravelerDashboard />);

    expect((await screen.findAllByText("Vikram Rao")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Refresh requests" }));

    expect((await screen.findAllByText("Mira Kapoor")).length).toBeGreaterThan(0);
    expect(listCorporateRequests).toHaveBeenCalledTimes(2);
  });

  it("deletes requests from the queue after confirmation", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);
    vi.mocked(deleteCorporateRequest).mockResolvedValue();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TravelerDashboard />);

    expect((await screen.findAllByText("Vikram Rao")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Delete request for Vikram Rao/i }));

    await waitFor(() => {
      expect(deleteCorporateRequest).toHaveBeenCalledWith("TR-2026-9001");
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Request deleted.");
    expect(screen.queryByText("Vikram Rao")).toBeNull();
    confirmSpy.mockRestore();
  });

  it("marks a critical issue and opens the recovery flight step directly", async () => {
    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Critical issue for TR-2026-9001"), {
      target: { value: "Flight cancelled - book an alternative from the same origin and adjust hotel dates if needed." }
    });

    await waitFor(() => {
      expect(updateCorporateCriticalIssue).toHaveBeenCalledWith(
        "TR-2026-9001",
        "Flight cancelled - book an alternative from the same origin and adjust hotel dates if needed.",
        "Urgent"
      );
    });
    expect(await screen.findByRole("button", { name: /Flights/i })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("complementary", { name: "AI Planning Assistant" })).toBeNull();
    expect(screen.getByText("Choose the recovery flight")).toBeTruthy();
    expect(screen.getByText(/This is a recovery workflow/i)).toBeTruthy();
    expect(screen.getAllByText("Recovery").length).toBeGreaterThan(0);
    expect(screen.queryByText(/cheaper option/i)).toBeNull();
  });

  it("lets the agent clear a critical issue", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{
      ...sampleRequest,
      criticalIssue: "Flight cancelled - book an alternative from the same origin and adjust hotel dates if needed.",
      criticalIssueStatus: "Urgent"
    }]);
    render(<TravelerDashboard />);

    expect((await screen.findAllByText(/Flight cancelled/i)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(updateCorporateCriticalIssue).toHaveBeenCalledWith("TR-2026-9001", null, "None");
    });
  });

  it("imports travel forms into the agent pending queue", async () => {
    const importedRequest = { ...sampleRequest, id: "TR-2026-9020", travellerName: "Nisha Patel" };
    vi.mocked(listCorporateRequests)
      .mockResolvedValueOnce([sampleRequest])
      .mockResolvedValueOnce([importedRequest, sampleRequest]);
    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9001")).length).toBeGreaterThan(0);
    const file = new File(["traveller,company"], "requests.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    fireEvent.change(screen.getByLabelText("Upload travel forms"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Import Forms/i }));

    await waitFor(() => {
      expect(uploadCorporateRequests).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText(/requests? entered intake/i)).toBeTruthy();
    expect(await screen.findByText("TR-2026-9020")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Processing\s+\d+$/i })).toHaveClass("active");
  });

  it("keeps workflow stages to new entries, details, processing, and completed filters", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([missingInfoRequest, generatedRequest, finalizedRequest]);

    render(<TravelerDashboard />);

    expect(await screen.findByRole("button", { name: /^New Entries\s+\d+$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Pending Details\s+\d+$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Processing\s+\d+$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Completed/i })).toBeTruthy();
    const statusTabs = screen.getByLabelText("Request status tabs");
    expect(within(statusTabs).queryByRole("button", { name: /In Process/i })).toBeNull();
    expect(within(statusTabs).queryByRole("button", { name: /Approval/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Priority Board" })).toBeNull();
    expect(screen.getByText("Next: Review plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Pending Details\s+\d+$/i }));
    expect(screen.getAllByText("Missing info").length).toBeGreaterThan(0);
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.getByText("Next: Ask for info")).toBeTruthy();
  });

  it("sends approval from the action panel when approval is required", async () => {
    render(<TravelerDashboard />);

    await openRequestWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Approval & Export/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Send Approval$/i }));

    await waitFor(() => {
      expect(sendCorporateRequestNotification).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        kind: "approval_request",
        to: ["vikram.rao@acme.com"]
      }));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Email accepted by Resend.");
  });

  it("keeps dashboard cards scan-friendly with route, dates, owner, freshness, and priority reasons", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([missingInfoRequest]);

    render(<TravelerDashboard />);

    expect((await screen.findAllByText("TR-2026-9002")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anika Shah").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Northstar Energy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Delhi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Singapore").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jun 24, 2026 - Jun 28, 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visa issue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing info").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Next: Ask for info").length).toBeGreaterThan(0);
    expect(screen.queryByText("Final itinerary draft after agent generation.")).toBeNull();
  });

  it("separates the request workspace into a focused stepper", async () => {
    render(<TravelerDashboard />);

    await openRequestWorkspace();
    expect(screen.getByRole("button", { name: /Missing Info/i })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Flights/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hotel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Itinerary/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Approval & Export/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Flights/i }));
    expect(screen.getAllByText("Policy Fit").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Approval status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Approval & Export/i }));
    expect(screen.getByLabelText("Approval status")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate Final Itinerary/i })).toBeTruthy();
  });

  it("uses only live queue requests without sample filler or fake totals", async () => {
    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
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

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Agent Operations/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Itineraries/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Traveler Roster/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Audit$/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open workflow notifications/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Requests$/i })).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "Search traveler, company, route" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Policy Context$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Application Admin/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Role" })).toBeNull();
  });

  it("shows Audit directly below Policy Context for scoped users", async () => {
    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    const navLabels = screen.getAllByRole("link").map((link) => link.textContent?.trim());
    const policyIndex = navLabels.indexOf("Policy Context");
    const auditIndex = navLabels.indexOf("Audit");

    expect(policyIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBe(policyIndex + 1);
  });

  it("keeps admin-authenticated users in the agent workspace shell", async () => {
    storeAdminWorkspace();
    window.localStorage.setItem("travel_ai_selected_role", "admin");
    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    expect(screen.getByLabelText("Current workspace")).toHaveTextContent("Agent Workspace");
    expect(screen.queryByRole("combobox", { name: "Role" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Application Admin/i })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("travel_ai_auth_context") || "{}").email).toBe("admin.user@unipro.com");
  });

  it("does not render the decorative picture in the sidebar", async () => {
    const { container } = render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    expect(container.querySelector(".sidebar-travel-image")).toBeNull();
  });

  it("clears the demo session when signing out", async () => {
    window.localStorage.setItem("travel_ai_selected_role", "agent");
    window.localStorage.setItem("travel_ai_user_email", "demo.agent@unipro.com");
    window.history.pushState({}, "", "/dashboard");

    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sign out/i }));

    expect(clearAuthSession).toHaveBeenCalled();
    expect(window.localStorage.getItem("travel_ai_selected_role")).toBeNull();
    expect(window.localStorage.getItem("travel_ai_user_email")).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  it("lets an agent create a travel request from the dashboard", async () => {
    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /New Request/i }));
    fireEvent.change(screen.getByLabelText("Traveller name"), { target: { value: "Anika Shah" } });
    fireEvent.change(screen.getByLabelText("Traveller email"), { target: { value: "anika.shah@example.com" } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Northstar Energy" } });
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Delhi" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Singapore" } });
    fireEvent.change(screen.getByLabelText("Depart date"), { target: { value: "2026-06-24" } });
    fireEvent.click(screen.getByLabelText("Return flight"));
    fireEvent.click(screen.getByLabelText("Hotel"));
    fireEvent.change(screen.getByLabelText("Travel purpose"), { target: { value: "Regional leadership meeting" } });
    fireEvent.click(screen.getByRole("button", { name: "Aisle seat" }));
    fireEvent.click(screen.getByRole("button", { name: "Vegetarian meal" }));
    fireEvent.click(screen.getByRole("button", { name: "Airport pickup" }));
    fireEvent.change(screen.getByLabelText("Other preference details"), { target: { value: "Aisle seat; Vegetarian meal; Prefer late morning departures" } });
    fireEvent.change(screen.getByLabelText("Other special request details"), { target: { value: "Airport pickup; Carry sample materials" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Request/i }));

    await waitFor(() => {
      expect(createCorporateRequest).toHaveBeenCalledWith(expect.objectContaining({
        travellerName: "Anika Shah",
        company: "Northstar Energy",
        destination: "Singapore",
        includeOutboundFlight: true,
        includeReturnFlight: false,
        includeHotel: false,
        budgetAmount: 150000,
        preferences: "Aisle seat; Vegetarian meal; Prefer late morning departures",
        specialRequests: "Airport pickup; Carry sample materials"
      }));
    });
    expect((await screen.findAllByText("TR-2026-9010")).length).toBeGreaterThan(0);
  });

  it("shows a safe message when request creation fails", async () => {
    vi.mocked(createCorporateRequest).mockRejectedValueOnce(new Error("backend stack trace with API_TOKEN"));

    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
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

    expect(await screen.findByRole("status")).toHaveTextContent("Request could not be created. Check the details and try again.");
    expect(screen.queryByText(/API_TOKEN|stack trace/i)).toBeNull();
  });

  it("generates the request detail plan and renders editable MVP sections", async () => {
    render(<TravelerDashboard />);

    await openRequestWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Refresh Options/i }));

    expect((await screen.findAllByText("Confirm mobile number for pickup.")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Flights/i }));
    expect(screen.getByText(/Select Airline/i)).toBeTruthy();
    expect(screen.getByText(/AI recommendation/i)).toBeTruthy();
    expect(screen.getAllByAltText(/flight visual/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Selected" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Select Flight" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Select Flight" })[0]);
    expect(screen.getAllByText(/Lowest Cost/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^3Hotel$/i }));
    expect(screen.getAllByText(/Select Hotel/i).length).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/hotel visual/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^5Itinerary$/i }));
    expect(screen.getByLabelText("AI Summary")).toBeTruthy();
    expect(screen.getByLabelText("Final Itinerary Preview")).toBeTruthy();
    expect(generateCorporateTravelPlan).toHaveBeenCalledWith("TR-2026-9001");
  });

  it("downloads the client request PDF from the request form", async () => {
    const objectUrl = "blob:client-form";
    const createObjectUrl = vi.fn(() => objectUrl);
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrl, configurable: true });

    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /New Request/i }));
    fireEvent.click(screen.getByRole("button", { name: /Client Form PDF/i }));

    await waitFor(() => {
      expect(downloadClientRequestFormPdf).toHaveBeenCalledTimes(1);
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
  });

  it("shows a safe message when the client request PDF cannot be downloaded", async () => {
    vi.mocked(downloadClientRequestFormPdf).mockRejectedValueOnce(new Error("Travel service request failed with API_TOKEN"));

    render(<TravelerDashboard />);

    expect(await screen.findByRole("heading", { name: "Travel Operations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /New Request/i }));
    fireEvent.click(screen.getByRole("button", { name: /Client Form PDF/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Client form PDF could not be downloaded. Please try again.");
    expect(screen.queryByText(/Travel service request failed|API_TOKEN/i)).toBeNull();
  });

  it("lets the agent save a note from the request details panel", async () => {
    render(<TravelerDashboard />);

    await openRequestWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Itinerary/i }));
    fireEvent.change(await screen.findByLabelText("AI Summary"), { target: { value: "Agent edited plan summary." } });
    fireEvent.click(await screen.findByRole("button", { name: /^Save$/i }));

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

    await openRequestWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Approval & Export/i }));
    fireEvent.change(await screen.findByLabelText("Approval status"), { target: { value: "Received" } });
    fireEvent.click(await screen.findByRole("button", { name: /Generate Final Itinerary/i }));

    await waitFor(() => {
      expect(finalizeCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        agent_reviewed: true,
        approval_status: "Received"
      }));
    });
    fireEvent.click(await screen.findByRole("button", { name: /Download PDF/i }));
    await waitFor(() => {
      expect(downloadCorporateRequestPdf).toHaveBeenCalledWith("TR-2026-9001");
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
  });

  it("shows a finalization gate message when export is blocked", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{ ...finalizedRequest, status: "finalized", finalApproved: true }]);
    vi.mocked(downloadCorporateRequestPdf).mockRejectedValue(new Error("Final itinerary is not ready: stack trace"));

    render(<TravelerDashboard />);

    await openRequestWorkspace("TR-2026-9003");
    fireEvent.click(screen.getByRole("button", { name: /Approval & Export/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Download PDF/i }));

    expect(await screen.findByText("Final itinerary is not ready. Complete approval and finalization before export.")).toBeTruthy();
    expect(screen.queryByText(/stack trace/i)).toBeNull();
  });

  it("uses contextual guided commands without claiming a booking", async () => {
    render(<TravelerDashboard />);

    await openRequestWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Flights/i }));
    expect(screen.getAllByText("Qatar Airways").length).toBeGreaterThan(0);
    expect(screen.getByText("HYD -> JNB · Qatar Airways · 1 stop")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Flights" }), {
      target: { value: "Compare policy-compliant options" }
    });
    fireEvent.click(await screen.findByRole("button", { name: /Update Step/i }));

    expect(await screen.findByText(/Live assistant response from the backend/i)).toBeTruthy();
    expect(chatWithAssistant).toHaveBeenCalledWith(expect.objectContaining({
      message: "Compare policy-compliant options",
      history: expect.any(Array),
      trip: expect.objectContaining({
        flight_offers: expect.arrayContaining([
          expect.objectContaining({
            notes: expect.arrayContaining([expect.stringMatching(/Estimated total/i)])
          })
        ]),
        request: expect.objectContaining({
          origin: "Hyderabad",
          destination: "Johannesburg"
        })
      }),
      budget_context: expect.arrayContaining([
        expect.objectContaining({ estimated_total: expect.any(Number), currency: expect.any(String) })
      ]),
      source_context: expect.objectContaining({
        request_id: "TR-2026-9001",
        active_step: "flights",
        selected_flight: expect.objectContaining({
          airline: "Qatar Airways",
          outbound: "HYD -> JNB · Qatar Airways · 1 stop"
        }),
        selected_hotel: expect.objectContaining({
          name: "Sandton Business Hotel"
        })
      })
    }));
    expect(screen.queryByRole("complementary", { name: "AI Planning Assistant" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand assistant" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assistant history" })).toBeNull();
  });

  it("updates the request budget from a guide command and persists it", async () => {
    render(<TravelerDashboard />);

    await openRequestWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Approval & Export/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Approval & Export" }), {
      target: { value: "Update budget to 200000 INR" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Step/i }));

    expect((await screen.findAllByText(/Budget updated to ₹200,000/i)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Approved budget")).toHaveValue(200000);

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        budgetAmount: 200000,
        budgetCurrency: "INR"
      }));
    });
  });

  it("updates traveller nationality from a guide command and removes it from missing information", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{
      ...generatedRequest,
      travellerNationality: "",
      missingInformation: "traveller_details.nationality\nConfirm mobile number for pickup."
    }]);
    render(<TravelerDashboard />);

    await openRequestWorkspace("TR-2026-9001");
    fireEvent.click(screen.getByRole("button", { name: /Missing Info/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Missing Info" }), {
      target: { value: "Traveller nationality is Indian" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Step/i }));

    expect(await screen.findByText(/Traveller nationality updated to Indian/i)).toBeTruthy();
    expect(screen.queryByDisplayValue(/traveller_details\.nationality/i)).toBeNull();

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        travellerNationality: "Indian",
        missingInformation: "Confirm mobile number for pickup."
      }));
    });
  });

  it("updates travel dates from a guide command and persists them", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{
      ...generatedRequest,
      departDate: "2026-06-10",
      returnDate: "2026-06-17",
      missingInformation: "travel_details.depart_date\ntravel_details.return_date\nConfirm mobile number for pickup."
    }]);
    render(<TravelerDashboard />);

    await openRequestWorkspace("TR-2026-9001");
    fireEvent.click(screen.getByRole("button", { name: /Missing Info/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Missing Info" }), {
      target: { value: "Update depart date to 2026-10-26 and return date to 2026-11-25" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Step/i }));

    expect(await screen.findByText(/Updated depart date Oct 26, 2026 and return date Nov 25, 2026/i)).toBeTruthy();
    expect(screen.getAllByText(/Oct 26, 2026 - Nov 25, 2026/i).length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue(/travel_details\.depart_date/i)).toBeNull();

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        departDate: "2026-10-26",
        returnDate: "2026-11-25",
        missingInformation: "Confirm mobile number for pickup."
      }));
    });
  });

  it("updates both travel and return dates from natural guide wording", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{
      ...generatedRequest,
      departDate: "2026-06-10",
      returnDate: "2026-06-17",
      missingInformation: "travel_details.depart_date\ntravel_details.return_date\nConfirm mobile number for pickup."
    }]);
    render(<TravelerDashboard />);

    await openRequestWorkspace("TR-2026-9001");
    fireEvent.click(screen.getByRole("button", { name: /Missing Info/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Missing Info" }), {
      target: { value: "travel date is oct 26 2026 and return date is nov 26 2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Step/i }));

    expect(await screen.findByText(/Updated depart date Oct 26, 2026 and return date Nov 26, 2026/i)).toBeTruthy();
    expect(screen.getAllByText(/Oct 26, 2026 - Nov 26, 2026/i).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        departDate: "2026-10-26",
        returnDate: "2026-11-26",
        missingInformation: "Confirm mobile number for pickup."
      }));
    });
  });

  it("understands broader date vocabulary for outbound and inbound travel dates", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{
      ...generatedRequest,
      departDate: "2026-06-10",
      returnDate: "2026-06-17",
      missingInformation: "travel_details.depart_date\ntravel_details.return_date"
    }]);
    render(<TravelerDashboard />);

    await openRequestWorkspace("TR-2026-9001");
    fireEvent.click(screen.getByRole("button", { name: /Missing Info/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Missing Info" }), {
      target: { value: "journey date is 26 Oct 2026 and inbound date is 26 Nov 2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Step/i }));

    expect(await screen.findByText(/Updated depart date Oct 26, 2026 and return date Nov 26, 2026/i)).toBeTruthy();

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        departDate: "2026-10-26",
        returnDate: "2026-11-26"
      }));
    });
  });

  it("updates a return date from natural guide wording with is on", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{
      ...generatedRequest,
      departDate: "2026-10-26",
      returnDate: "2026-11-25",
      missingInformation: "travel_details.return_date\nConfirm mobile number for pickup."
    }]);
    render(<TravelerDashboard />);

    await openRequestWorkspace("TR-2026-9001");
    fireEvent.click(screen.getByRole("button", { name: /Missing Info/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Missing Info" }), {
      target: { value: "the return date is on nov 26 2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Step/i }));

    expect(await screen.findByText(/Updated return date Nov 26, 2026/i)).toBeTruthy();
    expect(screen.getAllByText(/Oct 26, 2026 - Nov 26, 2026/i).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        departDate: "2026-10-26",
        returnDate: "2026-11-26",
        missingInformation: "Confirm mobile number for pickup."
      }));
    });
  });

  it("updates core traveller data such as name from a guide command and persists it", async () => {
    render(<TravelerDashboard />);

    await openRequestWorkspace("TR-2026-9001");
    fireEvent.click(screen.getByRole("button", { name: /Missing Info/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Guide command for Missing Info" }), {
      target: { value: "Change traveller name to Ananya Shah" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Step/i }));

    expect(await screen.findByText(/Traveller name updated to Ananya Shah/i)).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Ananya Shah" }).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        travellerName: "Ananya Shah"
      }));
    });
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

  it("renders the itinerary planner as its own working page", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);
    vi.mocked(generateCorporateTravelPlan).mockResolvedValue(generatedRequest);

    render(<TripPlannerScreen />);

    expect(await screen.findByRole("heading", { name: "Itinerary Planner" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Search itineraries" })).toBeTruthy();
    expect(screen.getByText("Policy Fit")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Builder" })).toHaveAttribute("href", "/itineraries/TR-2026-9001");
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));

    await waitFor(() => {
      expect(generateCorporateTravelPlan).toHaveBeenCalledWith("TR-2026-9001");
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Itinerary options are ready for review.");
  });

  it("shows a selected-plan budget rail with remaining or over-budget posture", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([
      {
        ...generatedRequest,
        recommendedPlans: generatedRequest.recommendedPlans.map((plan) => ({
          ...plan,
          selected: plan.id === "plan-c"
        }))
      }
    ]);

    render(<ItineraryBuilderScreen requestId="TR-2026-9001" />);

    expect(await screen.findByRole("heading", { name: "Budget Rail" })).toBeTruthy();
    expect(screen.getByText("Selected spend")).toBeTruthy();
    expect(screen.getAllByText("₹168,500").length).toBeGreaterThan(0);
    expect(screen.getByText("Approved budget")).toBeTruthy();
    expect(screen.getByText("₹150,000")).toBeTruthy();
    expect(screen.getByText("Over budget ₹18,500")).toBeTruthy();
    expect(screen.getByText("112% used")).toBeTruthy();
  });

  it("breaks the selected itinerary into flight hotel and transfer segments", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([generatedRequest]);

    render(<ItineraryBuilderScreen requestId="TR-2026-9001" />);

    expect(await screen.findByRole("heading", { name: "Flight Segment" })).toBeTruthy();
    expect(screen.getAllByText("Qatar one-stop flight").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Hotel Segment" })).toBeTruthy();
    expect(screen.getAllByText("Sandton hotel near office").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Transfer / Requests" })).toBeTruthy();
    expect(screen.getByText("Vegetarian meals")).toBeTruthy();
  });

  it("optimizes itinerary options from the itinerary builder", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([generatedRequest]);
    vi.mocked(generateCorporateTravelPlan).mockResolvedValue({
      ...generatedRequest,
      recommendedPlans: generatedRequest.recommendedPlans.map((plan) => ({
        ...plan,
        selected: plan.id === "plan-b"
      }))
    });

    render(<ItineraryBuilderScreen requestId="TR-2026-9001" />);

    fireEvent.click(await screen.findByRole("button", { name: "Optimize With AI" }));

    await waitFor(() => {
      expect(generateCorporateTravelPlan).toHaveBeenCalledWith("TR-2026-9001");
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Itinerary optimized for review.");
    expect(screen.getAllByRole("heading", { name: "Lowest Cost" }).length).toBeGreaterThan(0);
  });

  it("finalizes the selected itinerary from the itinerary builder after approval", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{ ...generatedRequest, approvalStatus: "Received" }]);
    vi.mocked(finalizeCorporateRequest).mockResolvedValue({
      ...finalizedRequest,
      id: "TR-2026-9001",
      travellerName: "Vikram Rao"
    });

    render(<ItineraryBuilderScreen requestId="TR-2026-9001" />);

    fireEvent.click(await screen.findByRole("button", { name: "Finalize Selected Itinerary" }));

    await waitFor(() => {
      expect(finalizeCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", {
        agent_reviewed: true,
        approval_status: "Received",
        finalApproved: true
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Itinerary finalized.");
    expect(screen.getByText("finalized")).toBeTruthy();
  });

  it("shows a safe blocked state when itinerary builder finalization fails", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([generatedRequest]);
    vi.mocked(finalizeCorporateRequest).mockRejectedValue(new Error("OPENROUTER_API_KEY stack trace"));

    render(<ItineraryBuilderScreen requestId="TR-2026-9001" />);

    fireEvent.click(await screen.findByRole("button", { name: "Finalize Selected Itinerary" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Finalization is blocked. Complete approval and agent review before finalizing.");
    expect(screen.queryByText(/OPENROUTER_API_KEY/)).toBeNull();
  });

  it("selects itinerary options from the itinerary builder", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([generatedRequest]);
    vi.mocked(updateCorporateRequest).mockImplementation(async (_id, payload) => ({
      ...generatedRequest,
      ...payload
    }));

    render(<ItineraryBuilderScreen requestId="TR-2026-9001" />);

    expect(await screen.findByRole("heading", { name: "Itinerary Builder" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select Lowest Cost" }));

    await waitFor(() => {
      expect(updateCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", expect.objectContaining({
        recommendedPlans: expect.arrayContaining([
          expect.objectContaining({ name: "Lowest Cost", selected: true }),
          expect.objectContaining({ name: "Policy Fit", selected: false })
        ])
      }));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Itinerary option selected.");
  });

  it("shows a safe manual follow-up state when approval email cannot be sent", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);
    vi.mocked(sendCorporateRequestNotification).mockRejectedValue(new Error("RESEND_API_KEY rejected for token secret"));

    render(<RequestWorkspaceScreen requestId="TR-2026-9001" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send Approval Email/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Approval email could not be sent. Continue with manual follow-up.");
    expect(screen.queryByText(/RESEND_API_KEY/)).toBeNull();
  });

  it("shows detected parameters and approval tracking in the request workspace", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);

    render(<RequestWorkspaceScreen requestId="TR-2026-9001" />);

    expect(await screen.findByRole("heading", { name: "Detected Parameters" })).toBeTruthy();
    expect(screen.getAllByText("Hyderabad → Johannesburg").length).toBeGreaterThan(0);
    expect(screen.getByText("Client meetings")).toBeTruthy();
    expect(screen.getByText("Aisle seat, hotel close to office")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Approval Tracking" })).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.getByText("Awaiting final approval")).toBeTruthy();
  });

  it("generates plans from the request workspace", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([sampleRequest]);
    vi.mocked(generateCorporateTravelPlan).mockResolvedValue(generatedRequest);

    render(<RequestWorkspaceScreen requestId="TR-2026-9001" />);

    expect(await screen.findByText("Vikram Rao")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate Plan" }));

    await waitFor(() => {
      expect(generateCorporateTravelPlan).toHaveBeenCalledWith("TR-2026-9001");
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Plan generated for workspace review.");
    expect(screen.getByText("Generated complete travel plan for Vikram.")).toBeTruthy();
  });

  it("finalizes itineraries from the request workspace after approval", async () => {
    vi.mocked(listCorporateRequests).mockResolvedValue([{ ...generatedRequest, approvalStatus: "Received" }]);
    vi.mocked(finalizeCorporateRequest).mockResolvedValue({
      ...finalizedRequest,
      id: "TR-2026-9001",
      travellerName: "Vikram Rao"
    });

    render(<RequestWorkspaceScreen requestId="TR-2026-9001" />);

    expect(await screen.findByText("Vikram Rao")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finalize Itinerary" }));

    await waitFor(() => {
      expect(finalizeCorporateRequest).toHaveBeenCalledWith("TR-2026-9001", {
        agent_reviewed: true,
        approval_status: "Received",
        finalApproved: true
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Final itinerary generated after agent review.");
    expect(screen.getByText("finalized")).toBeTruthy();
  });

  it("downloads final itinerary exports from the request workspace", async () => {
    const objectUrl = "blob:workspace-itinerary";
    const createObjectUrl = vi.fn(() => objectUrl);
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrl, configurable: true });
    vi.mocked(listCorporateRequests).mockResolvedValue([finalizedRequest]);
    vi.mocked(downloadCorporateRequestPdf).mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));

    render(<RequestWorkspaceScreen requestId="TR-2026-9003" />);

    expect(await screen.findByText("Mira Kapoor")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => {
      expect(downloadCorporateRequestPdf).toHaveBeenCalledWith("TR-2026-9003");
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
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
    fireEvent.click(screen.getByRole("button", { name: "Send PDF to Client" }));

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

    storeAdminWorkspace();
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

  it("shows loyalty programs and recent trips in the traveler dossier", async () => {
    vi.mocked(getTraveler).mockResolvedValue(documentUpdateTraveler);

    storeAdminWorkspace();
    render(<TravelerDossierScreen travelerId="traveler_anika" />);

    expect(await screen.findByRole("heading", { name: "Loyalty Programs" })).toBeTruthy();
    expect(await screen.findByText("United MileagePlus")).toBeTruthy();
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent Trips" })).toBeTruthy();
    expect(screen.getByText("Delhi to Singapore")).toBeTruthy();
  });

  it("filters the traveler roster by search text", async () => {
    vi.mocked(listTravelers).mockResolvedValue([
      documentUpdateTraveler,
      {
        ...documentUpdateTraveler,
        id: "traveler_ravi",
        name: "Ravi Menon",
        email: "ravi.menon@acme.com",
        company: "Acme Infrastructure",
        status: "Compliant",
        documents: [{ document_type: "passport", label: "Passport", status: "Ready", redacted_value: "On file" }]
      }
    ]);

    storeAdminWorkspace();
    render(<TravelerRosterScreen />);

    expect(await screen.findByText("Anika Shah")).toBeTruthy();
    expect(screen.getByText("Ravi Menon")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search travelers"), { target: { value: "northstar" } });

    expect(screen.getByText("Anika Shah")).toBeTruthy();
    expect(screen.queryByText("Ravi Menon")).toBeNull();
  });

  it("filters the traveler roster to document issues", async () => {
    vi.mocked(listTravelers).mockResolvedValue([
      documentUpdateTraveler,
      {
        ...documentUpdateTraveler,
        id: "traveler_ravi",
        name: "Ravi Menon",
        email: "ravi.menon@acme.com",
        company: "Acme Infrastructure",
        status: "Compliant",
        documents: [{ document_type: "passport", label: "Passport", status: "Ready", redacted_value: "On file" }]
      }
    ]);

    storeAdminWorkspace();
    render(<TravelerRosterScreen />);

    expect(await screen.findByText("Anika Shah")).toBeTruthy();
    expect(screen.getByText("Ravi Menon")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Document issues only"));

    expect(screen.getByText("Anika Shah")).toBeTruthy();
    expect(screen.queryByText("Ravi Menon")).toBeNull();
  });

  it("filters the traveler roster to VIP travelers", async () => {
    vi.mocked(listTravelers).mockResolvedValue([
      {
        ...documentUpdateTraveler,
        vip_level: "VIP Platinum"
      },
      {
        ...documentUpdateTraveler,
        id: "traveler_ravi",
        name: "Ravi Menon",
        email: "ravi.menon@acme.com",
        company: "Acme Infrastructure",
        vip_level: null,
        status: "Compliant",
        documents: [{ document_type: "passport", label: "Passport", status: "Ready", redacted_value: "On file" }]
      }
    ]);

    storeAdminWorkspace();
    render(<TravelerRosterScreen />);

    expect(await screen.findByText("Anika Shah")).toBeTruthy();
    expect(screen.getByText("Ravi Menon")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("VIP travelers only"));

    expect(screen.getByText("Anika Shah")).toBeTruthy();
    expect(screen.queryByText("Ravi Menon")).toBeNull();
  });

  it("lets agents approve pending registration forms into the traveler roster", async () => {
    vi.mocked(listTravelers).mockResolvedValue([]);

    render(<TravelerRosterScreen />);

    expect(await screen.findByRole("heading", { name: "Roster Review" })).toBeTruthy();
    const reviewQueue = screen.getByRole("region", { name: "Roster review queue" });
    expect(within(screen.getByRole("link", { name: "Open workflow notifications" })).getByText("2")).toBeTruthy();
    expect(within(reviewQueue).getByText("Ananya Shah")).toBeTruthy();
    fireEvent.click(within(reviewQueue).getAllByRole("button", { name: /Approve/i })[0]);

    expect(await screen.findByRole("status")).toHaveTextContent("Ananya Shah added to the traveler roster.");
    expect(saveTravelerProfile).toHaveBeenCalledWith(expect.objectContaining({
      email: "ananya.shah@orbitex.example",
      company: "Orbitex",
      seat_preference: "Window seat",
      meal_preference: "Vegetarian meal"
    }));
    expect(within(reviewQueue).queryByText("Ananya Shah")).toBeNull();
    expect(within(screen.getByRole("link", { name: "Open workflow notifications" })).getByText("1")).toBeTruthy();
    expect(screen.getByText("Ananya Shah")).toBeTruthy();
    expect(screen.getByText("ananya.shah@orbitex.example")).toBeTruthy();
  });

  it("does not ask agents to approve a registration that is already saved in the roster", async () => {
    vi.mocked(listTravelers).mockResolvedValue([
      {
        ...documentUpdateTraveler,
        id: "traveler_ananya_shah",
        name: "Ananya Shah",
        email: "ananya.shah@orbitex.example",
        company: "Orbitex",
        status: "Compliant",
        documents: [{ document_type: "passport", label: "Passport", status: "Needs Review", redacted_value: "Submitted by form" }]
      }
    ]);

    render(<TravelerRosterScreen />);

    const reviewQueue = await screen.findByRole("region", { name: "Roster review queue" });
    expect(within(reviewQueue).queryByText("Ananya Shah")).toBeNull();
    expect(within(reviewQueue).getByText("Vikram Rao")).toBeTruthy();
    expect(screen.getByText("ananya.shah@orbitex.example")).toBeTruthy();
  });

  it("keeps a registration in review when the roster save fails", async () => {
    vi.mocked(listTravelers).mockResolvedValue([]);
    vi.mocked(saveTravelerProfile).mockRejectedValue(new Error("save failed"));

    render(<TravelerRosterScreen />);

    const reviewQueue = await screen.findByRole("region", { name: "Roster review queue" });
    const ananyaReviewItem = within(reviewQueue).getByText("Ananya Shah").closest("article");
    expect(ananyaReviewItem).toBeTruthy();
    fireEvent.click(within(ananyaReviewItem as HTMLElement).getByRole("button", { name: /Approve/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ananya Shah could not be saved to the traveler roster. Please try again.");
    expect(within(reviewQueue).getByText("Ananya Shah")).toBeTruthy();
    expect(screen.queryByText("ananya.shah@orbitex.example")).toBeTruthy();
  });

  it("saves profile updates against the existing traveler record instead of creating a duplicate", async () => {
    const existingTraveler: TravelerProfile = {
      ...documentUpdateTraveler,
      id: "traveler_vikram_existing",
      name: "Vikram Rao",
      email: "vikram.rao@example.com",
      company: "Unipro",
      created_at: "2026-04-01T00:00:00.000Z"
    };
    vi.mocked(listTravelers).mockResolvedValue([existingTraveler]);

    render(<TravelerRosterScreen />);

    const reviewQueue = await screen.findByRole("region", { name: "Roster review queue" });
    const vikramReviewItem = within(reviewQueue).getByText("Vikram Rao").closest("article");
    expect(vikramReviewItem).toBeTruthy();
    fireEvent.click(within(vikramReviewItem as HTMLElement).getByRole("button", { name: /Approve/i }));

    await waitFor(() => {
      expect(saveTravelerProfile).toHaveBeenCalledWith(expect.objectContaining({
        id: "traveler_vikram_existing",
        email: "vikram.rao@example.com",
        created_at: "2026-04-01T00:00:00.000Z",
        hotel_preference: "Hotel preference updated"
      }));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Vikram Rao updated in the traveler roster.");
  });

  it("renders admin metrics and uploads Excel files to the backend route", async () => {
    storeAdminWorkspace();
    render(<AdminDashboard />);

    expect(await screen.findByRole("heading", { name: "Application Admin" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Application Admin/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Traveler Roster/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Agent Operations/i })).toBeTruthy();
    expect(screen.getByText("Total Requests")).toBeTruthy();
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("Pending Approvals")).toBeTruthy();
    expect(screen.getByText("Average Handling Time")).toBeTruthy();
    expect(screen.getByText("Johannesburg")).toBeTruthy();
    expect(screen.queryByText("Client Data Updates")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText("Import Company Data")).toBeTruthy();
    expect(screen.getByText(/traveler profiles/i)).toBeTruthy();
    expect(screen.getByText("Import Company Policy PDF")).toBeTruthy();
    expect(screen.getByText("Company Pipeline")).toBeTruthy();
    expect(screen.getByText("Acme Infrastructure")).toBeTruthy();

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
    fireEvent.click(screen.getByRole("button", { name: /Import Workbook/i }));

    await waitFor(() => {
      expect(uploadCorporateRequests).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText(/rows processed/i)).toBeTruthy();
    expect(await screen.findByText(/employee profiles imported/i)).toBeTruthy();
    expect(await screen.findByText("TR-2026-9020")).toBeTruthy();
  });

  it("renders recent safe audit events in the admin dashboard", async () => {
    storeAdminWorkspace();
    vi.mocked(getAuditEvents).mockResolvedValue([
      {
        id: "audit_1",
        trip_id: "TR-2026-9001",
        actor_id: null,
        event_type: "corporate.finalize.allowed",
        message: "Corporate final itinerary generated.",
        purpose: "finalize reviewed corporate itinerary",
        decision: "allow",
        created_at: "2026-05-22T00:00:00.000Z"
      }
    ]);

    render(<AdminDashboard />);

    expect(await screen.findByText("Recent Audit Activity")).toBeTruthy();
    expect(await screen.findByText("corporate.finalize.allowed")).toBeTruthy();
    expect(screen.getByText("Corporate final itinerary generated.")).toBeTruthy();
    expect(screen.queryByText("TR-2026-9001")).toBeNull();
  });

  it("renders workflow and email proof in the audit archive", async () => {
    vi.mocked(getAuditEvents).mockResolvedValue([
      {
        id: "audit_pipeline_final",
        trip_id: "corp_req_e190d69ae6ff",
        actor_id: null,
        event_type: "corporate.pipeline.final_sent",
        message: "Final itinerary sent to client.",
        purpose: "send final itinerary",
        decision: "allow",
        created_at: "2026-05-24T07:53:00.000Z"
      },
      {
        id: "audit_request_queue",
        trip_id: null,
        actor_id: null,
        event_type: "corporate.requests.list.allowed",
        message: "Corporate requests read.",
        purpose: "review corporate travel request queue",
        decision: "allow",
        created_at: "2026-05-24T07:54:00.000Z"
      }
    ]);
    vi.mocked(getEmailEvents).mockResolvedValue([
      {
        id: "email_final",
        request_id: "corp_req_e190d69ae6ff",
        kind: "final_itinerary",
        provider: "resend",
        status: "sent",
        to: ["ruthwik2610@gmail.com"],
        subject: "Final itinerary for E2E Pipeline",
        provider_message_id: "email_123",
        safe_message: "Final itinerary email accepted by Resend.",
        body_text: "Final itinerary for E2E Pipeline\nRoute: Hyderabad to San Jose\nRequest: corp_req_e190d69ae6ff",
        attachment_names: ["corp_req_e190d69ae6ff-final-itinerary.pdf"],
        created_at: "2026-05-24T07:53:00.000Z"
      },
      {
        id: "email_selected",
        request_id: "corp_req_e190d69ae6ff",
        kind: null,
        provider: "resend",
        status: "received",
        to: ["travel@erkaeheluu.resend.app"],
        subject: "Selected itinerary option",
        provider_message_id: "selected_pdf_123",
        safe_message: "Selected itinerary PDF received and matched.",
        body_text: "Itinerary Option 2\nRequest: corp_req_e190d69ae6ff",
        attachment_names: ["corp_req_e190d69ae6ff-option-2.pdf"],
        created_at: "2026-05-24T07:52:00.000Z"
      }
    ]);

    render(<AuditArchiveScreen />);

    expect(await screen.findByRole("heading", { name: "Audit" })).toBeTruthy();
    expect(screen.getAllByText("Pipeline And Itineraries").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Request Queue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Email Itinerary").length).toBeGreaterThan(0);
    expect(await screen.findByText("corporate.pipeline.final_sent")).toBeTruthy();
    expect(await screen.findByText("Final itinerary for E2E Pipeline")).toBeTruthy();
    expect(await screen.findByText("Selected itinerary PDF received and matched.")).toBeTruthy();
    expect(screen.getAllByText("View email itinerary").length).toBeGreaterThan(0);
    expect(screen.getByText(/Route: Hyderabad to San Jose/)).toBeTruthy();
    expect(screen.getByText(/corp_req_e190d69ae6ff-final-itinerary.pdf/)).toBeTruthy();
    expect(screen.getAllByText("corp_req_e190d69ae6ff").length).toBeGreaterThan(0);
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
