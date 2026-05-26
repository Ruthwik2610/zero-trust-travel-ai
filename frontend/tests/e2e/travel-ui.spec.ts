import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Travel operations workflow is desktop-first.");
  await mockTravelBackend(page);
});

const agentAuthUser = {
  user_id: "usr_agent",
  email: "demo.agent@unipro.com",
  role: "traveler",
  department: "travel_ops",
  scopes: ["travel:plan", "policy:read"],
  manager_scope: [],
  token_expires_at: Math.floor(Date.now() / 1000) + 900
};

const adminAuthUser = {
  user_id: "usr_admin",
  email: "admin.user@unipro.com",
  role: "travel_manager",
  department: "travel_ops",
  scopes: ["admin:summary", "travel:plan", "policy:read"],
  manager_scope: ["travel_ops"],
  token_expires_at: Math.floor(Date.now() / 1000) + 900
};

const baseRequest = {
  id: "TR-2026-9001",
  owner_id: "usr_agent",
  owner_department: "travel_ops",
  status: "New",
  approval_status: "Required",
  traveller_details: {
    traveler_name: "Vikram Rao",
    traveler_email: "vikram.rao@example.com",
    nationality: "India",
    passport_expiry: "2028-01-15"
  },
  company_details: {
    company_name: "Acme Infrastructure",
    approving_manager: "Travel Manager"
  },
  travel_details: {
    origin: "Hyderabad",
    destination: "Johannesburg",
    destination_country: "South Africa",
    depart_date: "2026-06-10",
    return_date: "2026-06-17",
    trip_purpose: "Client meetings",
    travelers: 1,
    cabin: "economy"
  },
  preferences: {
    preferred_airline: "Qatar Airways",
    hotel_preference: "4-star hotel near Sandton",
    meal_preference: "Vegetarian",
    timing_preference: "Morning arrival"
  },
  budgets: {
    total_budget: 180000,
    currency: "INR"
  },
  special_requests: ["Airport transfer"],
  critical_issue: null,
  critical_issue_status: "None",
  generated_plan: null,
  created_at: "2026-05-20T08:00:00.000Z",
  updated_at: "2026-05-20T08:00:00.000Z"
};

const importedRequest = {
  ...baseRequest,
  id: "TR-2026-9100",
  status: "New",
  approval_status: "Not Required",
  traveller_details: {
    ...baseRequest.traveller_details,
    traveler_name: "Priya Menon",
    traveler_email: "priya.menon@example.com"
  },
  company_details: {
    company_name: "Orbitex Cloud",
    approving_manager: "Travel Manager"
  },
  travel_details: {
    ...baseRequest.travel_details,
    origin: "Bengaluru",
    destination: "Berlin",
    destination_country: "Germany",
    depart_date: "2026-07-08",
    return_date: "2026-07-13",
    trip_purpose: "Partner onboarding"
  },
  budgets: {
    total_budget: 2200,
    currency: "EUR"
  },
  updated_at: "2026-05-20T11:00:00.000Z"
};

const generatedPlan = {
  request_summary: "Vikram Rao needs client meeting travel from Hyderabad to Johannesburg.",
  missing_information: ["Please confirm meeting location."],
  travel_readiness: {
    passport_status: "Ready",
    visa_status: "Needs Review",
    transit_warning: "Transit requirements need review before ticketing.",
    document_notes: ["Visa confirmation is required before final itinerary."]
  },
  budget_policy_check: {
    budget_status: "Within Budget",
    policy_status: "Needs Approval",
    approval_required: true,
    approval_reason: "International travel requires approval.",
    total_budget: 180000,
    estimated_cost: 178000
  },
  travel_options: [
    {
      option_name: "Best within budget",
      flight_offer_id: "flight-qr-jnb",
      flight_summary: "Qatar Airways one-stop route with evening departure.",
      hotel_summary: "4-star Sandton hotel near meeting location.",
      estimated_cost: 178000,
      pros: ["Within target", "Close to meeting area"],
      cons: ["One connection"],
      policy_status: "Needs Approval",
      recommendation_reason: "Best balance of budget and convenience."
    },
    {
      option_name: "Fastest route",
      flight_offer_id: "flight-et-jnb",
      flight_summary: "Shortest practical one-stop route.",
      hotel_summary: "Business hotel near Sandton.",
      estimated_cost: 205000,
      pros: ["Fastest schedule"],
      cons: ["Above budget"],
      policy_status: "Needs Approval",
      recommendation_reason: "Use when schedule matters most."
    }
  ],
  flight_offers: [
    {
      id: "flight-qr-jnb",
      provider: "Duffel",
      airline: "Qatar Airways",
      summary: "HYD to JNB via Doha.",
      total_amount: 143800,
      currency: "INR",
      outbound: "HYD 21:20 -> DOH 23:25, DOH 02:10 -> JNB 10:15",
      return_leg: "JNB 13:35 -> DOH 23:05, DOH 02:00 -> HYD 08:20",
      cabin: "economy",
      expires_at: "2026-05-23T13:30:00.000Z",
      source: "duffel",
      notes: ["Policy fit"]
    },
    {
      id: "flight-et-jnb",
      provider: "Duffel",
      airline: "Ethiopian Airlines",
      summary: "HYD to JNB via Addis Ababa.",
      total_amount: 168500,
      currency: "INR",
      outbound: "HYD 03:30 -> ADD 07:10, ADD 09:00 -> JNB 13:05",
      return_leg: "JNB 14:30 -> ADD 20:25, ADD 23:50 -> HYD 08:10",
      cabin: "economy",
      expires_at: "2026-05-23T13:30:00.000Z",
      source: "duffel",
      notes: ["Fastest connection"]
    }
  ],
  selected_flight_offer_id: "flight-qr-jnb",
  hotel_offers: [
    {
      id: "hotel-sandton-business",
      provider: "booking.com-demand-api",
      name: "Sandton Business Hotel",
      summary: "4-star Sandton hotel near meeting location.",
      total_amount: 34200,
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
    },
    {
      id: "hotel-rosebank-flex",
      provider: "synthetic-booking/flexible",
      name: "Rosebank Flexible Stay",
      summary: "Flexible corporate stay with stronger cancellation posture.",
      total_amount: 40800,
      currency: "INR",
      address: "Rosebank, Johannesburg",
      star_rating: 4,
      check_in: "2026-06-12",
      check_out: "2026-06-18",
      nights: 6,
      rooms: 1,
      guests: 1,
      image_url: "/travel-media/hotel-city.png",
      source: "synthetic",
      notes: []
    }
  ],
  selected_hotel_offer_id: "hotel-sandton-business",
  agent_note: "Route this request for approval before finalizing.",
  agent_notes: ["Live Duffel flight offers are attached for agent review (duffel-api/qr).", "Live Booking.com hotel offers informed the hotel summaries (booking.com-demand-api)."],
  customer_message_draft: "Dear Vikram, please confirm the meeting location before final itinerary.",
  customer_itinerary_draft: "Corporate Travel Itinerary draft for Hyderabad to Johannesburg.",
  approval_status: "Required"
};

const travelers = [
  {
    id: "traveler_priya",
    name: "Priya Menon",
    email: "priya.menon@example.com",
    company: "Orbitex Cloud",
    department: "Sales",
    vip_level: "Gold",
    status: "Ready",
    location: "Bengaluru",
    seat_preference: "Aisle",
    meal_preference: "Vegetarian",
    hotel_preference: "Near office",
    policy_notes: ["Use company preferred hotels."],
    loyalty_programs: [{ provider: "United MileagePlus", tier: "Gold", account_ref: "****4567" }],
    documents: [{ document_type: "passport", label: "Passport", status: "Ready", redacted_value: "****4567" }],
    recent_trips: ["Delhi to Singapore"],
    created_at: "2026-05-20T00:00:00.000Z",
    updated_at: "2026-05-20T00:00:00.000Z"
  }
];

type BackendState = {
  requests: Array<typeof baseRequest>;
  travelers: Array<Record<string, any>>;
  latestChatPayload: Record<string, any> | null;
};

async function mockTravelBackend(page: Page): Promise<BackendState> {
  const state: BackendState = {
    requests: [baseRequest],
    travelers: [...travelers],
    latestChatPayload: null
  };

  const requestById = (url: string) => {
    const id = url.match(/\/api\/corporate\/requests\/([^/]+)/)?.[1];
    return state.requests.find((request) => request.id === decodeURIComponent(id || "")) || state.requests[0];
  };

  await page.route("**/api/auth/demo-login", async (route) => {
    const body = route.request().postDataJSON() as { email?: string; username?: string; password?: string };
    const user = body.username === "admin" ? adminAuthUser : body.username === "agent" ? agentAuthUser : null;
    if (!user || body.password !== "travel-demo-2026" || (body.email && body.email !== user.email)) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Unauthorized" }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-token",
        token_type: "bearer",
        expires_at: user.token_expires_at,
        user
      })
    });
  });

  await page.route("**/api/corporate/requests", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, any>;
      const created = {
        ...baseRequest,
        id: "TR-2026-9200",
        traveller_details: payload.traveller_details,
        company_details: payload.company_details,
        travel_details: payload.travel_details,
        preferences: payload.preferences,
        budgets: payload.budgets,
        special_requests: payload.special_requests,
        updated_at: "2026-05-20T12:00:00.000Z"
      };
      state.requests = [created, ...state.requests];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.requests) });
  });

  await page.route("**/api/corporate/requests/upload-excel", async (route) => {
    state.requests = [importedRequest, ...state.requests.filter((request) => request.id !== importedRequest.id)];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ request_count: 1, created_request_ids: [importedRequest.id], employee_profile_count: 1 })
    });
  });

  await page.route("**/api/corporate/company-policy/upload-pdf", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        company_name: "Acme Infrastructure",
        policy_count: 1,
        rules: ["Allowed cabins: economy,premium_economy"]
      })
    });
  });

  await page.route("**/api/corporate/companies", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          company_name: "Acme Infrastructure",
          traveler_count: 2,
          traveler_list_status: "Updated",
          policy_status: "Uploaded",
          policy_count: 1,
          visa_record_count: 2,
          history_row_count: 4
        }
      ])
    });
  });

  await page.route("**/api/corporate/requests/*/critical-issue", async (route) => {
    const body = route.request().postDataJSON() as { issue?: string; status?: string };
    const updated = {
      ...requestById(route.request().url()),
      critical_issue: body.issue || null,
      critical_issue_status: body.status || "Urgent",
      updated_at: "2026-05-20T12:30:00.000Z"
    };
    state.requests = state.requests.map((request) => request.id === updated.id ? updated : request);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(updated) });
  });

  await page.route("**/api/corporate/requests/*/plan", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Record<string, any>;
      const current = requestById(route.request().url());
      const updated = {
        ...current,
        status: "Plan Generated",
        approval_status: body.generated_plan?.approval_status || "Required",
        generated_plan: { ...generatedPlan, ...body.generated_plan },
        traveller_details: { ...current.traveller_details, ...(body.traveller_details || {}) },
        company_details: { ...current.company_details, ...(body.company_details || {}) },
        travel_details: { ...current.travel_details, ...(body.travel_details || {}) },
        preferences: { ...current.preferences, ...(body.preferences || {}) },
        special_requests: body.special_requests || current.special_requests,
        updated_at: "2026-05-20T13:30:00.000Z"
      };
      state.requests = state.requests.map((request) => request.id === updated.id ? updated : request);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(updated) });
      return;
    }
    const planned = {
      ...requestById(route.request().url()),
      status: "Plan Generated",
      approval_status: "Required",
      generated_plan: generatedPlan,
      updated_at: "2026-05-20T13:00:00.000Z"
    };
    state.requests = state.requests.map((request) => request.id === planned.id ? planned : request);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(planned) });
  });

  await page.route("**/api/corporate/requests/*/finalize", async (route) => {
    const finalized = {
      ...requestById(route.request().url()),
      status: "Finalized",
      approval_status: "Received",
      generated_plan: { ...generatedPlan, approval_status: "Received" },
      updated_at: "2026-05-20T14:00:00.000Z"
    };
    state.requests = state.requests.map((request) => request.id === finalized.id ? finalized : request);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(finalized) });
  });

  await page.route("**/api/agent/chat", async (route) => {
    state.latestChatPayload = route.request().postDataJSON() as Record<string, any>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        message: "Visa review is the blocker. The selected Qatar Airways flight is loaded in context.",
        model: "e2e-model",
        audit_events: []
      })
    });
  });

  await page.route("**/api/corporate/requests/*/notifications", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "email_e2e",
        request_id: requestById(route.request().url()).id,
        kind: "approval_request",
        provider: "e2e",
        status: "sent",
        to: ["manager@example.com"],
        subject: "Approval requested",
        provider_message_id: "e2e-message",
        safe_message: "Approval email accepted.",
        created_at: "2026-05-20T14:15:00.000Z"
      })
    });
  });

  await page.route("**/api/corporate/requests/*/export.xlsx", async (route) => {
    await route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "itinerary" });
  });

  await page.route("**/api/corporate/excel-template", async (route) => {
    await route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "template" });
  });

  await page.route("**/api/corporate/admin/summary", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        total_requests: 7,
        by_status: { New: 2, "Missing Info": 1, "Waiting for Approval": 2, Finalized: 1 },
        approval_required: 2,
        finalized: 1,
        visa_issues: 1,
        average_handling_time_hours: 3.5,
        common_destinations: [{ destination: "Johannesburg", count: 3 }]
      })
    });
  });

  await page.route("**/api/admin/audit", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "audit_e2e",
          trip_id: "TR-2026-9001",
          actor_id: "manager",
          event_type: "corporate.finalize.allowed",
          message: "Corporate final itinerary generated.",
          purpose: "finalize reviewed corporate itinerary",
          decision: "allow",
          created_at: "2026-05-20T10:15:00.000Z"
        }
      ])
    });
  });

  await page.route("**/api/travelers", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.travelers) });
  });

  await page.route("**/api/travelers/*", async (route) => {
    const id = decodeURIComponent(route.request().url().split("/api/travelers/")[1] || "");
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as Record<string, any>;
      const saved = { ...payload, id, updated_at: "2026-05-24T12:00:00.000Z" };
      const existingIndex = state.travelers.findIndex((traveler) => traveler.id === id);
      if (existingIndex >= 0) {
        state.travelers[existingIndex] = { ...saved, created_at: state.travelers[existingIndex].created_at };
      } else {
        state.travelers = [saved, ...state.travelers];
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(existingIndex >= 0 ? state.travelers[existingIndex] : saved) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.travelers.find((traveler) => traveler.id === id) || state.travelers[0]) });
  });

  await page.route("**/api/policies**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
  });

  return state;
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Continue to workspace/i }).click();
}

test("login presents the agent-only MVP workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('.brand-lockup img[src="/unipro-logo.png"]').first()).toBeVisible();
  await expect(page.locator(".brand-lockup strong", { hasText: "Travel Operations" })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveValue("agent");
  await expect(page.getByLabel("Password")).toHaveValue("travel-demo-2026");
  await expect(page.getByLabel("Account email")).toHaveCount(0);
  await expect(page.getByText("Travel Agent", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Application Admin/i })).toHaveCount(0);
  await expect(page.getByText("Research Intake")).toHaveCount(0);
});

test("agent workspace has one queue search, unique navigation, and no decorative dead buttons", async ({ page }) => {
  await signIn(page);
  await page.waitForURL("**/dashboard");

  await expect(page.getByRole("heading", { name: "Travel Operations" })).toBeVisible();
  await expect(page.getByLabel("Current workspace")).toContainText("Agent Workspace");
  await expect(page.getByRole("link", { name: /Agent Operations/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Itineraries/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Traveler Roster/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open workflow notifications/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Application Admin/i })).toHaveCount(0);
  await expect(page.getByLabel("Role")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Search requests" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search traveler, company, route" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prev" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Next$/ })).toHaveCount(0);

  const navHrefs = await page.locator("nav[aria-label='Travel operations navigation'] a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(new Set(navHrefs).size).toBe(navHrefs.length);
});

test("agent imports a PDF travel form and sees the created request as pending", async ({ page }) => {
  await signIn(page);
  await page.waitForURL("**/dashboard");

  await page.getByLabel("Upload travel forms").setInputFiles({
    name: "travel-form.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e travel form")
  });
  await page.getByRole("button", { name: "Import Forms" }).click();

  await expect(page.getByRole("status")).toContainText("1 request entered intake from travel-form.pdf.");
  await expect(page.getByText("Priya Menon").first()).toBeVisible();
  await expect(page.getByText("Bengaluru").first()).toBeVisible();
  await expect(page.getByText("Berlin").first()).toBeVisible();
});

test("agent opens a request, generates options, and uses guided context with flight and hotel visuals", async ({ page }) => {
  const backend = await mockTravelBackend(page);

  await signIn(page);
  await page.waitForURL("**/dashboard");
  await page.getByRole("button", { name: /TR-2026-9001 Next:/i }).click();

  await expect(page.locator("h1", { hasText: "Vikram Rao" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "AI Planning Assistant" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Missing Info/i })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: /Generate Options/i }).click();
  await expect(page.getByRole("status")).toContainText("Plan generated for agent review.");

  await page.getByRole("button", { name: /Flights/i }).click();
  await expect(page.getByRole("heading", { name: /Select Airline/i })).toBeVisible();
  await expect(page.getByText("Qatar Airways").first()).toBeVisible();
  await expect(page.getByAltText(/Qatar Airways flight visual/i)).toBeVisible();

  await page.getByRole("button", { name: /Next: Select Hotel/i }).click();
  await expect(page.getByRole("heading", { name: /Select Hotel/i })).toBeVisible();
  await expect(page.getByText("Sandton Business Hotel").first()).toBeVisible();
  await expect(page.getByAltText(/Sandton Business Hotel hotel visual/i)).toBeVisible();

  await page.getByRole("button", { name: /Flights/i }).click();
  await page.getByRole("textbox", { name: "Guide command for Flights" }).fill("What is blocking this trip?");
  await page.getByRole("button", { name: "Update Step" }).click();
  await expect(page.getByText("Visa review is the blocker.")).toBeVisible();

  expect(backend.latestChatPayload?.source_context?.active_step).toBe("flights");
  expect(backend.latestChatPayload?.source_context?.selected_flight?.airline).toBe("Qatar Airways");
  expect(backend.latestChatPayload?.source_context?.selected_flight?.outbound).toContain("HYD 21:20");
  expect(backend.latestChatPayload?.source_context?.selected_hotel?.name).toBe("Sandton Business Hotel");
});

test("agent guide updates core request fields and persists them", async ({ page }) => {
  await signIn(page);
  await page.waitForURL("**/dashboard");
  await page.getByRole("button", { name: /TR-2026-9001 Next:/i }).click();

  await page.getByRole("textbox", { name: "Guide command for Missing Info" }).fill("Change traveller name to Ananya Shah");
  const nameSaveResponse = page.waitForResponse((response) => response.url().includes("/api/corporate/requests/TR-2026-9001/plan") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Update Step" }).click();
  await nameSaveResponse;
  await expect(page.getByText(/Traveller name updated to Ananya Shah/i)).toBeVisible();
  await expect(page.locator(".request-detail-card").getByRole("status")).toContainText("Traveller name updated and saved.");
  await expect(page.locator("h2", { hasText: "Ananya Shah" })).toBeVisible();

  await page.getByRole("textbox", { name: "Guide command for Missing Info" }).fill("Update depart date to 2026-10-26 and return date to 2026-11-25");
  const dateSaveResponse = page.waitForResponse((response) => response.url().includes("/api/corporate/requests/TR-2026-9001/plan") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Update Step" }).click();
  await dateSaveResponse;
  await expect(page.getByText(/Updated depart date Oct 26, 2026 and return date Nov 25, 2026/i)).toBeVisible();
  await expect(page.locator(".request-detail-card").getByRole("status")).toContainText("Travel dates updated and saved.");
  await expect(page.locator(".selected-trip-hero")).toContainText("Oct 26, 2026 - Nov 25, 2026");
});

test("agent marks a critical issue and opens the recovery flight step", async ({ page }) => {
  const backend = await mockTravelBackend(page);

  await signIn(page);
  await page.waitForURL("**/dashboard");
  await page.getByLabel("Critical issue for TR-2026-9001").selectOption({ label: "Flight cancelled" });

  await expect(page.getByRole("button", { name: /Flights/i })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("complementary", { name: "AI Planning Assistant" })).toHaveCount(0);
  await expect(page.getByText("Choose the recovery flight")).toBeVisible();
  await expect(page.getByText(/This is a recovery workflow/i)).toBeVisible();
  await expect(page.getByText(/cheaper option/i)).toHaveCount(0);
  await page.getByRole("textbox", { name: "Guide command for Flights" }).fill("Flight was cancelled. What is the remedy?");
  await page.getByRole("button", { name: "Update Step" }).click();
  await expect(page.getByText("Visa review is the blocker.")).toBeVisible();

  expect(backend.latestChatPayload?.source_context?.active_step).toBe("flights");
  expect(backend.latestChatPayload?.source_context?.recovery_mode).toBe(true);
  expect(backend.latestChatPayload?.source_context?.critical_issue?.issue).toContain("Flight cancelled");
  expect(backend.latestChatPayload?.source_context?.route_constraints?.origin).toBe("Hyderabad");
});

test("agent approval and finalize controls move the request to export", async ({ page }) => {
  await signIn(page);
  await page.waitForURL("**/dashboard");
  await page.getByRole("button", { name: /TR-2026-9001 Next:/i }).click();
  await page.getByRole("button", { name: /Generate Options/i }).click();
  await expect(page.getByRole("status")).toContainText("Plan generated for agent review.");

  await page.getByRole("button", { name: /Approval & Export/i }).click();
  await page.locator(".request-detail-card").getByRole("button", { name: /^Send Approval$/i }).click();
  await expect(page.locator(".request-detail-card").getByRole("status")).toContainText("Approval email accepted.");
  await page.getByLabel("Approval status").selectOption("Received");
  const saveResponse = page.waitForResponse((response) => response.url().includes("/api/corporate/requests/TR-2026-9001/plan") && response.request().method() === "PUT");
  await page.locator(".request-detail-card").getByRole("button", { name: /^Save$/i }).click();
  await saveResponse;
  await expect(page.locator(".request-detail-card").getByRole("status")).toContainText("Edits saved.");

  await page.getByRole("button", { name: /Generate Final Itinerary/i }).click();
  await expect(page.locator(".request-detail-card").getByRole("status")).toContainText("Final itinerary generated after agent review.");
  await expect(page.getByRole("button", { name: /Download PDF/i })).toBeVisible();
});

test("agent owns traveler roster review for registrations and profile updates", async ({ page }) => {
  await signIn(page);
  await page.waitForURL("**/dashboard");
  await page.getByRole("link", { name: /Traveler Roster/i }).click();

  await expect(page.getByRole("heading", { name: "Traveler Roster" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Roster Review" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open workflow notifications/i }).locator("strong")).toHaveText("2");
  await expect(page.getByText("Ananya Shah")).toBeVisible();
  await page.locator(".roster-review-item").filter({ hasText: "Ananya Shah" }).getByRole("button", { name: /Approve/i }).click();
  await expect(page.getByRole("status")).toContainText("Ananya Shah added to the traveler roster.");
  await expect(page.getByText("ananya.shah@orbitex.example")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open workflow notifications/i }).locator("strong")).toHaveText("1");
  await page.reload();
  await expect(page.locator(".roster-review-card")).not.toContainText("Ananya Shah");
  await expect(page.getByText("ananya.shah@orbitex.example")).toBeVisible();
});

test("agent can inspect traveler data and the old admin route returns to dashboard", async ({ page }) => {
  await signIn(page);
  await page.waitForURL("**/dashboard");
  await page.goto("/admin");
  await page.waitForURL("**/dashboard");
  await page.goto("/travelers");

  await expect(page.getByRole("heading", { name: "Traveler Roster" })).toBeVisible();
  await expect(page.getByText("Priya Menon")).toBeVisible();
  await page.getByText("Priya Menon").click();
  await expect(page.getByRole("heading", { name: "Traveler Dossier" })).toBeVisible();
  await expect(page.getByText("United MileagePlus")).toBeVisible();
  await expect(page.getByText("****4567")).toBeVisible();
});
