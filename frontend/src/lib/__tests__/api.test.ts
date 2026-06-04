import { beforeEach, describe, expect, it, vi } from "vitest";

const requestPayload = {
  origin: "Hyderabad",
  destination: "Johannesburg",
  depart_date: "2026-06-10",
  return_date: "2026-06-17",
  travelers: 1,
  cabin: "economy" as const,
  budget_usd: 1200,
  purpose: "Client meetings"
};

async function loadApi(baseUrl = "") {
  vi.resetModules();
  if (baseUrl) {
    process.env.NEXT_PUBLIC_TRAVEL_AI_API_BASE_URL = baseUrl;
  } else {
    delete process.env.NEXT_PUBLIC_TRAVEL_AI_API_BASE_URL;
  }
  return import("../api");
}

function mockJsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );
}

function mockBlobResponse(body = "template") {
  return Promise.resolve(
    new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    })
  );
}

function mockUnauthorizedResponse() {
  return Promise.resolve(new Response("", { status: 401 }));
}

function mockForbiddenResponse() {
  return Promise.resolve(new Response("", { status: 403 }));
}

describe("travel API client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
    window.localStorage.clear();
    delete process.env.NEXT_PUBLIC_TRAVEL_AI_API_BASE_URL;
  });

  it("uses the documented public API base URL", async () => {
    const fetchMock = vi.fn(() => mockJsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const { checkHealth } = await loadApi("https://travel.example");

    await checkHealth();

    expect(fetchMock).toHaveBeenCalledWith("https://travel.example/health", expect.any(Object));
  });

  it("uses the travel-ai API prefix when mounted under /travel-ai", async () => {
    const fetchMock = vi.fn(() => mockJsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/travel-ai/");
    const { checkHealth } = await loadApi();

    await checkHealth();

    expect(fetchMock).toHaveBeenCalledWith("/travel-ai/health", expect.any(Object));
  });

  it("calls the standalone travel backend routes with purpose-bound headers", async () => {
    const fetchMock = vi.fn(() => mockJsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const { chatWithAssistant, convertCurrency, getAdminSummary, getAuditEvents, getEmailEvents, getTrips, planTrip, saveTrip } = await loadApi();
    window.localStorage.setItem("travel_ai_api_token", "secure-token");

    await planTrip(requestPayload);
    await chatWithAssistant({ message: "Do I need a visa?", history: [] });
    await convertCurrency({ amount_usd: 1850, to_currency: "INR" });
    await getTrips();
    await saveTrip(requestPayload);
    await getAdminSummary();
    await getAuditEvents();
    await getEmailEvents();

    const fetchCalls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;

    expect(fetchCalls.map(([url]) => url)).toEqual([
      "/api/agent/plan",
      "/api/agent/chat",
      "/api/tools/currency-conversion",
      "/api/trips",
      "/api/trips",
      "/api/admin/summary",
      "/api/admin/audit",
      "/api/corporate/admin/email-events"
    ]);
    expect(fetchCalls.map(([, init]) => init.headers)).toMatchObject([
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "plan compliant business travel" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "chat with travel assistant for compliant business travel" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "plan compliant business travel" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "review own saved trips" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "save compliant travel draft" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "review aggregate travel budget and policy posture" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "review security audit events" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "review corporate travel email audit events" }
    ]);
  });

  it("saves traveler roster profiles with a purpose-bound PUT request", async () => {
    const fetchMock = vi.fn(() => mockJsonResponse({ id: "traveler_ananya_shah" }));
    vi.stubGlobal("fetch", fetchMock);
    const { saveTravelerProfile } = await loadApi("https://travel.example");
    window.localStorage.setItem("travel_ai_api_token", "secure-token");

    await saveTravelerProfile({
      id: "traveler_ananya_shah",
      name: "Ananya Shah",
      email: "ananya.shah@orbitex.example",
      company: "Orbitex",
      department: null,
      vip_level: null,
      status: "Compliant",
      location: "Mumbai home office",
      seat_preference: "Window seat",
      meal_preference: "Vegetarian meal",
      hotel_preference: null,
      policy_notes: [],
      loyalty_programs: [],
      documents: [{ document_type: "passport", label: "Passport", status: "Needs Review", redacted_value: "Submitted by form" }],
      recent_trips: [],
      created_at: "2026-05-24T00:00:00.000Z",
      updated_at: "2026-05-24T00:00:00.000Z"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://travel.example/api/travelers/traveler_ananya_shah",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer secure-token",
          "Content-Type": "application/json",
          "X-Travel-Purpose": "save traveler roster profile"
        })
      })
    );
  });

  it("stores backend-issued auth context", async () => {
    const user = {
      user_id: "usr_admin",
      email: "admin.user@unipro.com",
      role: "travel_manager" as const,
      department: "travel_ops",
      scopes: ["admin:summary"],
      manager_scope: ["sales"],
      token_expires_at: Math.floor(Date.now() / 1000) + 900
    };
    const { getStoredAuthContext, storeAuthSession } = await loadApi();

    storeAuthSession({
      access_token: "token",
      token_type: "bearer",
      expires_at: user.token_expires_at,
      user
    });

    expect(window.localStorage.getItem("travel_ai_api_token")).toBe("token");
    expect(getStoredAuthContext()).toMatchObject({ email: "admin.user@unipro.com", role: "travel_manager" });
  });

  it("clears an expired browser token without silently minting a new session", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => mockUnauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { chatWithAssistant } = await loadApi();
    window.localStorage.setItem("travel_ai_user_email", "demo.user@unipro.com");
    window.localStorage.setItem("travel_ai_api_token", "stale-token");

    await expect(chatWithAssistant({ message: "Check policy", history: [] })).rejects.toThrow("Travel service request failed");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/agent/chat"
    ]);
    expect(window.localStorage.getItem("travel_ai_api_token")).toBeNull();
    expect(window.localStorage.getItem("travel_ai_user_email")).toBeNull();
  });

  it("does not use email-only refresh to recover a stale scope token", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => mockForbiddenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { planTrip } = await loadApi();
    window.localStorage.setItem("travel_ai_user_email", "admin.user@unipro.com");
    window.localStorage.setItem("travel_ai_api_token", "stale-admin-token");

    await expect(planTrip(requestPayload)).rejects.toThrow("Travel service request failed");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/agent/plan"
    ]);
    expect(window.localStorage.getItem("travel_ai_api_token")).toBeNull();
    expect(window.localStorage.getItem("travel_ai_user_email")).toBeNull();
  });

  it("sends username and password when signing in", async () => {
    const user = {
      user_id: "usr_admin",
      email: "admin.user@unipro.com",
      role: "travel_manager" as const,
      department: "travel_ops",
      scopes: ["admin:summary", "travel:plan"],
      manager_scope: ["travel_ops"],
      token_expires_at: Math.floor(Date.now() / 1000) + 900
    };
    const fetchMock = vi.fn(() => mockJsonResponse({
      access_token: "admin-token",
      token_type: "bearer",
      expires_at: user.token_expires_at,
      user
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { demoLogin } = await loadApi();

    await expect(demoLogin("admin.user@unipro.com", "travel-demo-2026", "admin")).resolves.toMatchObject({ access_token: "admin-token" });

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      email: "admin.user@unipro.com",
      username: "admin",
      password: "travel-demo-2026"
    });
  });

  it("maps corporate MVP routes and backend payloads", async () => {
    const backendRequest = {
      id: "corp_req_123",
      status: "Plan Generated",
      traveller_details: { traveler_name: "Raja", traveler_email: "raja@example.com" },
      company_details: { company_name: "Unipro" },
      travel_details: {
        origin: "Hyderabad",
        destination: "Johannesburg",
        depart_date: "2026-06-12",
        return_date: "2026-06-18",
        trip_purpose: "Business meeting",
        include_outbound_flight: true,
        include_return_flight: false,
        include_hotel: false
      },
      preferences: { hotel_preference: "4-star near Sandton" },
      budgets: { total_budget: 180000, currency: "INR" },
      special_requests: ["Vegetarian meals"],
      generated_plan: {
        request_summary: "Raja needs Hyderabad to Johannesburg travel.",
        missing_information: ["Confirm meeting location."],
        travel_readiness: {
          passport_status: "Ready",
          visa_status: "Needs Review",
          transit_warning: "Review transit rules",
          document_notes: ["Business visa must be verified."]
        },
        budget_policy_check: {
          budget_status: "Within Budget",
          policy_status: "Compliant",
          approval_required: false,
          approval_reason: "",
          estimated_cost: 174000,
          total_budget: 180000
        },
        travel_options: [
          {
            option_name: "Best within budget",
            flight_offer_id: "off_live_123",
            flight_summary: "Morning one-stop flight",
            hotel_summary: "4-star Sandton hotel",
            estimated_cost: 174000,
            pros: ["Within budget"],
            cons: [],
            policy_status: "Compliant",
            recommendation_reason: "Best balance"
          },
          {
            option_name: "Fastest route",
            flight_summary: "Shortest layover",
            hotel_summary: "4-star Sandton hotel",
            estimated_cost: 190000,
            pros: ["Fast"],
            cons: ["Needs approval"],
            policy_status: "Needs Approval",
            recommendation_reason: "Saves time"
          },
          {
            option_name: "Comfort-focused option",
            flight_summary: "Better timing",
            hotel_summary: "Premium hotel",
            estimated_cost: 205000,
            pros: ["Comfortable"],
            cons: ["Higher cost"],
            policy_status: "Needs Approval",
            recommendation_reason: "Most comfortable"
          }
        ],
        flight_offers: [
          {
            id: "off_live_123",
            provider: "duffel-api/qr",
            airline: "Qatar Airways",
            summary: "Qatar Airways HYD to JNB",
            total_amount: 1200,
            currency: "USD",
            outbound: "HYD -> JNB · Qatar Airways · 1 stop",
            return_leg: "JNB -> HYD · Qatar Airways · 1 stop",
            cabin: "economy",
            expires_at: "2026-05-22T12:00:00Z",
            source: "duffel",
            notes: ["Offer ID: off_live_123"]
          }
        ],
        selected_flight_offer_id: "off_live_123",
        hotel_offers: [
          {
            id: "hotel_live_123",
            provider: "booking.com-demand-api",
            name: "Sandton Business Hotel",
            summary: "4-star Sandton hotel near client office.",
            total_amount: 54000,
            currency: "INR",
            address: "Sandton, Johannesburg",
            star_rating: 4,
            check_in: "2026-06-12",
            check_out: "2026-06-18",
            nights: 6,
            rooms: 1,
            guests: 1,
            image_url: "/travel-media/hotel-business.png",
            source: "booking",
            notes: ["Near office"]
          }
        ],
        selected_hotel_offer_id: "hotel_live_123",
        agent_note: "Verify visa.",
        agent_notes: ["Verify visa."],
        customer_message_draft: "Please confirm meeting location.",
        customer_itinerary_draft: "Corporate Travel Itinerary",
        approval_status: "Plan Generated"
      },
      updated_at: "2026-05-19T10:00:00Z"
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => mockJsonResponse(backendRequest))
      .mockImplementationOnce(() => mockJsonResponse(backendRequest))
      .mockImplementationOnce(() => mockJsonResponse({ request_count: 1, employee_profile_count: 2, created_request_ids: ["corp_req_123"] }))
      .mockImplementationOnce(() => mockBlobResponse())
      .mockImplementationOnce(() => mockBlobResponse("itinerary"))
      .mockImplementationOnce(() => mockBlobResponse("%PDF-1.4"))
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("travel_ai_api_token", "secure-token");
    const {
      deleteCorporateRequest,
      downloadCorporateExcelTemplate,
      downloadCorporateRequestExcel,
      downloadCorporateRequestPdf,
      finalizeCorporateRequest,
      generateCorporateTravelPlan,
      uploadCorporateRequests
    } = await loadApi();

    const generated = await generateCorporateTravelPlan("corp_req_123");
    expect(generated).toMatchObject({
      id: "corp_req_123",
      travellerName: "Raja",
      includeOutboundFlight: true,
      includeReturnFlight: false,
      includeHotel: false,
      status: "planning"
    });
    expect(generated.recommendedPlans[0]).toMatchObject({ name: "Best within budget", totalAmount: 174000 });
    expect(generated.flightOffers[0]).toMatchObject({ id: "off_live_123", source: "duffel", selected: true });
    expect(generated.hotelOffers[0]).toMatchObject({ id: "hotel_live_123", source: "booking", selected: true, imageUrl: "/travel-media/hotel-business.png" });

    await expect(finalizeCorporateRequest("corp_req_123", {
      agent_reviewed: true,
      approval_status: "Received"
    })).resolves.toMatchObject({ id: "corp_req_123" });

    const file = new File(["demo"], "travel.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await expect(uploadCorporateRequests(file)).resolves.toMatchObject({
      totalRows: 3,
      createdRequests: 1,
      employeeProfiles: 2,
      requests: [{ id: "corp_req_123" }]
    });
    await expect(downloadCorporateExcelTemplate()).resolves.toHaveProperty("size");
    await expect(downloadCorporateRequestExcel("corp_req_123")).resolves.toHaveProperty("size");
    await expect(downloadCorporateRequestPdf("corp_req_123")).resolves.toHaveProperty("size");
    await expect(deleteCorporateRequest("corp_req_123")).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/corporate/requests/corp_req_123/plan",
      "/api/corporate/requests/corp_req_123/finalize",
      "/api/corporate/requests/upload-excel",
      "/api/corporate/excel-template",
      "/api/corporate/requests/corp_req_123/export.xlsx",
      "/api/corporate/requests/corp_req_123/export.pdf",
      "/api/corporate/requests/corp_req_123"
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      agent_reviewed: true,
      approval_status: "Received"
    });
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).not.toMatchObject({ "Content-Type": "application/json" });
    expect((fetchMock.mock.calls[3][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secure-token",
      "X-Travel-Purpose": "download corporate travel excel template"
    });
    expect((fetchMock.mock.calls[4][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secure-token",
      "X-Travel-Purpose": "download finalized corporate travel itinerary excel"
    });
    expect((fetchMock.mock.calls[6][1] as RequestInit)).toMatchObject({
      method: "DELETE"
    });
  });

  it("keeps received approval separate from the backend plan lifecycle status", async () => {
    const backendRequest = {
      id: "corp_req_123",
      status: "Plan Generated",
      approval_status: "Received",
      traveller_details: {
        name: "Raja",
        email: "raja@example.com",
        employee_id: "EMP-1",
        department: "Delivery"
      },
      company_details: {
        company_name: "Unipro",
        policy_tier: "Standard"
      },
      travel_details: {
        origin: "Hyderabad",
        destination: "Johannesburg",
        depart_date: "2026-06-10",
        return_date: "2026-06-17",
        purpose: "Client meetings"
      },
      preferences: {},
      budgets: {
        currency: "INR",
        max_amount: 150000
      },
      generated_plan: {
        request_summary: "Saved plan",
        missing_information: [],
        travel_readiness: {
          passport_status: "Ready",
          visa_status: "Ready",
          transit_warning: "None",
          document_notes: []
        },
        budget_policy_check: {
          budget_status: "Within Budget",
          policy_status: "Compliant",
          approval_required: false,
          approval_reason: "No approval required.",
          estimated_cost: 120000,
          total_budget: 150000
        },
        travel_options: [
          { option_name: "Best within budget", flight_summary: "Flight", hotel_summary: "Hotel", estimated_cost: 120000, pros: [], cons: [], policy_status: "Compliant", recommendation_reason: "Best fit" },
          { option_name: "Fastest route", flight_summary: "Flight", hotel_summary: "Hotel", estimated_cost: 130000, pros: [], cons: [], policy_status: "Compliant", recommendation_reason: "Fastest" },
          { option_name: "Comfort-focused option", flight_summary: "Flight", hotel_summary: "Hotel", estimated_cost: 140000, pros: [], cons: [], policy_status: "Compliant", recommendation_reason: "Comfort" }
        ],
        agent_note: "Ready",
        agent_notes: [],
        customer_message_draft: "Ready",
        customer_itinerary_draft: "Ready",
        approval_status: "Plan Generated"
      },
      updated_at: "2026-05-19T10:00:00Z"
    };
    const fetchMock = vi.fn(() => mockJsonResponse(backendRequest));
    vi.stubGlobal("fetch", fetchMock);
    const { updateCorporateRequest } = await loadApi();

    await updateCorporateRequest("corp_req_123", {
      aiSummary: "Saved plan",
      approvalStatus: "Received",
      status: "planning",
      recommendedPlans: [
        { id: "plan-a", name: "Policy Fit", totalAmount: 120000, currency: "INR", flightSummary: "Flight", hotelSummary: "Hotel", policyFit: "Compliant", tradeoffs: "" }
      ]
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.generated_plan.approval_status).toBe("Plan Generated");
  });

  it("maps automated pipeline statuses and exposes pipeline actions", async () => {
    const processingRequest = {
      id: "corp_req_auto",
      status: "Processing",
      approval_status: "Required",
      traveller_details: { traveler_name: "Priya", traveler_email: "priya@example.com" },
      company_details: { company_name: "Unipro" },
      travel_details: {
        origin: "Bengaluru",
        destination: "Berlin",
        depart_date: "2026-07-08",
        return_date: "2026-07-13",
        trip_purpose: "Partner workshop"
      },
      preferences: {},
      budgets: { total_budget: 2200, currency: "EUR" },
      generated_plan: {
        request_summary: "Automated options prepared.",
        missing_information: [],
        travel_readiness: {
          passport_status: "Needs Review",
          visa_status: "Needs Review",
          transit_warning: "Review transit rules",
          document_notes: []
        },
        budget_policy_check: {
          budget_status: "Within Budget",
          policy_status: "Compliant",
          approval_required: true,
          approval_reason: "Client selection pending.",
          estimated_cost: 2100
        },
        travel_options: [
          {
            option_name: "Fastest route",
            flight_summary: "Fast flight",
            hotel_summary: "Central hotel",
            estimated_cost: 2100,
            policy_status: "Compliant",
            recommendation_reason: "Arrives earliest."
          }
        ],
        customer_message_draft: "Review options.",
        customer_itinerary_draft: "Draft itinerary.",
        approval_status: "Processing"
      },
      updated_at: "2026-05-24T10:00:00Z"
    };
    const completedRequest = { ...processingRequest, status: "Completed", approval_status: "Received" };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => mockJsonResponse(processingRequest))
      .mockImplementationOnce(() => mockJsonResponse(completedRequest));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("travel_ai_api_token", "secure-token");
    const { recordClientItineraryApproval, runCorporateRequestPipeline } = await loadApi();

    await expect(runCorporateRequestPipeline("corp_req_auto")).resolves.toMatchObject({
      id: "corp_req_auto",
      status: "processing",
      approvalStatus: "Required"
    });
    await expect(recordClientItineraryApproval("corp_req_auto", { selected_option_index: 1 })).resolves.toMatchObject({
      id: "corp_req_auto",
      status: "finalized",
      approvalStatus: "Received"
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/corporate/requests/corp_req_auto/pipeline",
      "/api/corporate/requests/corp_req_auto/client-approval"
    ]);
  });

  it("sends budget edits and compact readiness fields when updating a request", async () => {
    const backendRequest = {
      id: "corp_req_123",
      status: "Plan Generated",
      traveller_details: {
        name: "Raja",
        email: "raja@example.com"
      },
      company_details: {
        company_name: "Unipro"
      },
      travel_details: {
        origin: "Hyderabad",
        destination: "Sanjose",
        depart_date: "2026-10-26",
        return_date: "2026-11-25",
        purpose: "Client meeting"
      },
      preferences: {},
      budgets: {
        currency: "INR",
        total_budget: 200000
      },
      generated_plan: {
        request_summary: "Saved plan",
        missing_information: [],
        travel_readiness: {
          passport_status: "Needs Review",
          visa_status: "Needs Review",
          transit_warning: "Transit requirements were not verified and need review before ticketing",
          document_notes: []
        },
        budget_policy_check: {
          budget_status: "Within Budget",
          policy_status: "Compliant",
          approval_required: false,
          approval_reason: "",
          estimated_cost: 180000,
          total_budget: 200000
        },
        travel_options: [],
        agent_note: "Ready",
        agent_notes: [],
        customer_message_draft: "Ready",
        customer_itinerary_draft: "Ready",
        approval_status: "Plan Generated"
      },
      updated_at: "2026-05-19T10:00:00Z"
    };
    const fetchMock = vi.fn(() => mockJsonResponse(backendRequest));
    vi.stubGlobal("fetch", fetchMock);
    const { updateCorporateRequest } = await loadApi();

    await updateCorporateRequest("corp_req_123", {
      aiSummary: "Saved plan",
      travellerName: "Ananya Shah",
      travellerEmail: "ananya.shah@orbitex.example",
      company: "Orbitex",
      origin: "Mumbai",
      destination: "San Jose",
      departDate: "2026-10-26",
      returnDate: "2026-11-25",
      includeOutboundFlight: true,
      includeReturnFlight: false,
      includeHotel: false,
      purpose: "Client meeting",
      budgetAmount: 200000,
      budgetCurrency: "INR",
      readinessCheck: [
        "Passport: Passport: Needs Review Visa: Needs Review Transit: Transit requirements were not verified and need review before ticketing.",
        "Passport expiry was not provided.",
        "Visa requirement needs review because no matching provided visa rule verified the route.",
        "Visa: Passport: Needs Review Visa: Needs Review Transit: Transit requirements were not verified and need review before ticketing."
      ].join(" ")
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.budgets).toEqual({
      total_budget: 200000,
      currency: "INR"
    });
    expect(body.traveller_details).toEqual({
      traveler_name: "Ananya Shah",
      traveler_email: "ananya.shah@orbitex.example"
    });
    expect(body.company_details).toEqual({ company_name: "Orbitex" });
    expect(body.travel_details).toEqual({
      origin: "Mumbai",
      destination: "San Jose",
      depart_date: "2026-10-26",
      return_date: "2026-11-25",
      include_outbound_flight: true,
      include_return_flight: false,
      include_hotel: false,
      trip_purpose: "Client meeting"
    });
    expect(body.generated_plan.travel_readiness).toMatchObject({
      passport_status: "Needs Review",
      visa_status: "Needs Review",
      transit_warning: "Transit requirements were not verified and need review before ticketing"
    });
    expect(JSON.stringify(body.generated_plan.travel_readiness)).not.toMatch(/Passport: Passport:/);
  });
});
