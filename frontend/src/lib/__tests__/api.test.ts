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
    const { chatWithAssistant, convertCurrency, getAdminSummary, getAuditEvents, getTrips, planTrip, saveTrip } = await loadApi();
    window.localStorage.setItem("travel_ai_api_token", "secure-token");

    await planTrip(requestPayload);
    await chatWithAssistant({ message: "Do I need a visa?", history: [] });
    await convertCurrency({ amount_usd: 1850, to_currency: "INR" });
    await getTrips();
    await saveTrip(requestPayload);
    await getAdminSummary();
    await getAuditEvents();

    const fetchCalls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;

    expect(fetchCalls.map(([url]) => url)).toEqual([
      "/api/agent/plan",
      "/api/agent/chat",
      "/api/tools/currency-conversion",
      "/api/trips",
      "/api/trips",
      "/api/admin/summary",
      "/api/admin/audit"
    ]);
    expect(fetchCalls.map(([, init]) => init.headers)).toMatchObject([
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "plan compliant business travel" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "chat with travel assistant for compliant business travel" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "plan compliant business travel" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "review own saved trips" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "save compliant travel draft" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "review aggregate travel budget and policy posture" },
      { Authorization: "Bearer secure-token", "X-Travel-Purpose": "review security audit events" }
    ]);
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

  it("refreshes an expired browser token once before retrying a protected request", async () => {
    const user = {
      user_id: "usr_demo",
      email: "demo.user@unipro.com",
      role: "traveler" as const,
      department: "sales",
      scopes: ["travel:plan"],
      manager_scope: [],
      token_expires_at: Math.floor(Date.now() / 1000) + 900
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => mockUnauthorizedResponse())
      .mockImplementationOnce(() => mockJsonResponse({
        access_token: "fresh-token",
        token_type: "bearer",
        expires_at: user.token_expires_at,
        user
      }))
      .mockImplementationOnce(() => mockJsonResponse({ message: "Ready", model: "model", audit_events: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { chatWithAssistant } = await loadApi();
    window.localStorage.setItem("travel_ai_user_email", "demo.user@unipro.com");
    window.localStorage.setItem("travel_ai_api_token", "stale-token");

    await expect(chatWithAssistant({ message: "Check policy", history: [] })).resolves.toMatchObject({ message: "Ready" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/agent/chat",
      "/api/auth/demo-login",
      "/api/agent/chat"
    ]);
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer fresh-token",
      "X-Travel-Purpose": "chat with travel assistant for compliant business travel"
    });
  });

  it("refreshes a stale scope token once before retrying a protected request", async () => {
    const user = {
      user_id: "usr_admin",
      email: "admin.user@unipro.com",
      role: "travel_manager" as const,
      department: "travel_ops",
      scopes: ["admin:summary", "travel:plan"],
      manager_scope: ["sales"],
      token_expires_at: Math.floor(Date.now() / 1000) + 900
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => mockForbiddenResponse())
      .mockImplementationOnce(() => mockJsonResponse({
        access_token: "fresh-admin-token",
        token_type: "bearer",
        expires_at: user.token_expires_at,
        user
      }))
      .mockImplementationOnce(() => mockJsonResponse({ trip: { flight_offers: [], hotel_offers: [] }, risk: "low", user_message: "Ready", audit_events: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { planTrip } = await loadApi();
    window.localStorage.setItem("travel_ai_user_email", "admin.user@unipro.com");
    window.localStorage.setItem("travel_ai_api_token", "stale-admin-token");

    await expect(planTrip(requestPayload)).resolves.toMatchObject({ user_message: "Ready" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/agent/plan",
      "/api/auth/demo-login",
      "/api/agent/plan"
    ]);
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer fresh-admin-token",
      "X-Travel-Purpose": "plan compliant business travel"
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
        trip_purpose: "Business meeting"
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
      .mockImplementationOnce(() => mockJsonResponse({ request_count: 1, created_request_ids: ["corp_req_123"] }))
      .mockImplementationOnce(() => mockBlobResponse())
      .mockImplementationOnce(() => mockBlobResponse("itinerary"));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("travel_ai_api_token", "secure-token");
    const {
      downloadCorporateExcelTemplate,
      downloadCorporateRequestExcel,
      finalizeCorporateRequest,
      generateCorporateTravelPlan,
      uploadCorporateRequests
    } = await loadApi();

    const generated = await generateCorporateTravelPlan("corp_req_123");
    expect(generated).toMatchObject({
      id: "corp_req_123",
      travellerName: "Raja",
      status: "planning"
    });
    expect(generated.recommendedPlans[0]).toMatchObject({ name: "Best within budget", totalAmount: 174000 });

    await expect(finalizeCorporateRequest("corp_req_123", {
      agent_reviewed: true,
      approval_status: "Received"
    })).resolves.toMatchObject({ id: "corp_req_123" });

    const file = new File(["demo"], "travel.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await expect(uploadCorporateRequests(file)).resolves.toMatchObject({
      totalRows: 1,
      createdRequests: 1,
      requests: [{ id: "corp_req_123" }]
    });
    await expect(downloadCorporateExcelTemplate()).resolves.toBeInstanceOf(Blob);
    await expect(downloadCorporateRequestExcel("corp_req_123")).resolves.toBeInstanceOf(Blob);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/corporate/requests/corp_req_123/plan",
      "/api/corporate/requests/corp_req_123/finalize",
      "/api/corporate/requests/upload-excel",
      "/api/corporate/excel-template",
      "/api/corporate/requests/corp_req_123/export.xlsx"
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
  });
});
