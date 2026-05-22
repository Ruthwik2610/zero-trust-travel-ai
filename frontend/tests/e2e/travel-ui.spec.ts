import { expect, test, type Page } from "@playwright/test";

const authUser = {
  user_id: "usr_agent",
  email: "demo.agent@unipro.com",
  role: "travel_manager",
  department: "travel_ops",
  scopes: ["admin:summary", "travel:plan"],
  manager_scope: [],
  token_expires_at: Math.floor(Date.now() / 1000) + 900
};

const baseRequest = {
  id: "corp_req_e2e",
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
    hotel_preference: "4-star hotel near Sandton",
    meal_preference: "Vegetarian",
    timing_preference: "Morning arrival"
  },
  budgets: {
    total_budget: 180000,
    currency: "INR"
  },
  special_requests: ["Airport transfer"],
  generated_plan: null,
  created_at: "2026-05-20T08:00:00.000Z",
  updated_at: "2026-05-20T08:00:00.000Z"
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
    budget_status: "Needs Approval",
    policy_status: "Needs Approval",
    approval_required: true,
    approval_reason: "Estimated cost is above the preferred budget.",
    total_budget: 180000,
    estimated_cost: 190000
  },
  travel_options: [
    {
      option_name: "Best within budget",
      flight_summary: "One-stop economy routing with morning arrival.",
      hotel_summary: "4-star Sandton hotel near meeting location.",
      estimated_cost: 178000,
      pros: ["Within target", "Close to meeting area"],
      cons: ["One connection"],
      policy_status: "Needs Approval",
      recommendation_reason: "Best balance of budget and convenience."
    },
    {
      option_name: "Fastest route",
      flight_summary: "Shortest practical one-stop route.",
      hotel_summary: "Business hotel near Sandton.",
      estimated_cost: 205000,
      pros: ["Fastest schedule"],
      cons: ["Above budget"],
      policy_status: "Needs Approval",
      recommendation_reason: "Use when schedule matters most."
    },
    {
      option_name: "Comfort-focused option",
      flight_summary: "Comfortable routing with stronger layover buffer.",
      hotel_summary: "Upgraded business hotel.",
      estimated_cost: 225000,
      pros: ["Better rest profile"],
      cons: ["Highest cost"],
      policy_status: "Needs Approval",
      recommendation_reason: "Use for high-stakes meetings."
    }
  ],
  agent_note: "Route this request for approval before finalizing.",
  agent_notes: ["No live booking APIs were used."],
  customer_message_draft: "Dear Vikram, please confirm the meeting location before final itinerary.",
  customer_itinerary_draft: "Corporate Travel Itinerary draft for Hyderabad to Johannesburg.",
  approval_status: "Waiting for Approval"
};

function generatedPlanFor(request: typeof baseRequest) {
  const traveler = request.traveller_details.traveler_name;
  const purpose = request.travel_details.trip_purpose.toLowerCase();
  return {
    ...generatedPlan,
    request_summary: `${traveler} needs ${purpose} travel from ${request.travel_details.origin} to ${request.travel_details.destination}.`
  };
}

function withPlan(request = baseRequest, update = {}) {
  return {
    ...request,
    status: "Waiting for Approval",
    approval_status: "Required",
    generated_plan: generatedPlanFor(request),
    updated_at: "2026-05-20T09:00:00.000Z",
    ...update
  };
}

async function mockBackend(page: Page) {
  let createdRequest: typeof baseRequest | null = null;

  function requestFromUrl(url: string) {
    const match = url.match(/\/api\/corporate\/requests\/([^/]+)/);
    const requestId = match?.[1];
    return requestId === createdRequest?.id ? createdRequest : baseRequest;
  }

  await page.route("**/api/auth/demo-login", async (route) => {
    const body = route.request().postDataJSON() as { email?: string };
    const email = body.email || authUser.email;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-token",
        token_type: "bearer",
        expires_at: authUser.token_expires_at,
        user: { ...authUser, email }
      })
    });
  });

  await page.route("**/api/corporate/requests", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      createdRequest = {
        ...baseRequest,
        id: "corp_req_created",
        traveller_details: payload.traveller_details as typeof baseRequest.traveller_details,
        company_details: payload.company_details as typeof baseRequest.company_details,
        travel_details: payload.travel_details as typeof baseRequest.travel_details,
        preferences: payload.preferences as typeof baseRequest.preferences,
        budgets: payload.budgets as typeof baseRequest.budgets,
        special_requests: payload.special_requests as typeof baseRequest.special_requests,
        updated_at: "2026-05-20T10:00:00.000Z"
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(createdRequest)
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([baseRequest])
    });
  });

  await page.route("**/api/corporate/requests/*/plan", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(withPlan(requestFromUrl(route.request().url())))
    });
  });

  await page.route("**/api/corporate/requests/*/finalize", async (route) => {
    const request = requestFromUrl(route.request().url());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(withPlan(request, { status: "Finalized", approval_status: "Received" }))
    });
  });

  await page.route("**/api/corporate/requests/*/export.xlsx", async (route) => {
    await route.fulfill({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: "itinerary"
    });
  });

  await page.route("**/api/corporate/excel-template", async (route) => {
    await route.fulfill({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: "template"
    });
  });

  await page.route("**/api/corporate/admin/summary", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        total_requests: 7,
        by_status: {
          New: 2,
          "Missing Info": 1,
          "Ready for Planning": 1,
          "Plan Generated": 1,
          "Waiting for Approval": 1,
          Finalized: 1,
          Cancelled: 0
        },
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
          trip_id: "corp_req_e2e",
          actor_id: null,
          event_type: "corporate.finalize.allowed",
          message: "Corporate final itinerary generated.",
          purpose: "finalize reviewed corporate itinerary",
          decision: "allow",
          created_at: "2026-05-20T10:15:00.000Z"
        }
      ])
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("login exposes only Agent and Admin roles", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Unipro Travel Operations")).toBeVisible();
  await expect(page.getByRole("button", { name: /Travel Agent/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Application Admin/i })).toBeVisible();
  await expect(page.getByText("Research Intake")).toHaveCount(0);
});

test("agent completes the MVP request lifecycle", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");

  await expect(page.getByRole("heading", { name: "Agent Operations Dashboard" })).toBeVisible();
  await expect(page.getByText("Vikram Rao").first()).toBeVisible();
  await expect(page.getByText("Acme Infrastructure").first()).toBeVisible();

  await page.getByRole("button", { name: /New Request/i }).click();
  await page.getByLabel("Traveller name").fill("Raja Demo");
  await page.getByLabel("Traveller email").fill("raja.demo@example.com");
  await page.getByLabel("Company").fill("Unipro Demo");
  await page.getByLabel("Origin").fill("Hyderabad");
  await page.getByLabel("Destination").fill("Johannesburg");
  await page.getByLabel("Depart date").fill("2026-06-12");
  await page.getByLabel("Return date").fill("2026-06-18");
  await page.getByLabel("Budget").fill("180000");
  await page.getByLabel("Travel purpose").fill("Business meeting");
  await page.getByRole("button", { name: /Create Request/i }).click();

  await expect(page.getByText("Raja Demo").first()).toBeVisible();
  await page.getByRole("button", { name: /Generate AI Plan/i }).click();
  await page.getByRole("tab", { name: "Plan" }).click();
  await expect(page.getByText("Best within budget").first()).toBeVisible();
  await expect(page.getByLabel("AI Summary")).toContainText("Raja Demo needs business meeting travel");
  await page.getByRole("tab", { name: "Approval & Finalize" }).click();
  await page.getByLabel("Approval status").selectOption("Received");
  const finalizeButton = page.getByRole("button", { name: /Generate Final Itinerary/i });
  await finalizeButton.scrollIntoViewIfNeeded();
  await finalizeButton.click();
  const exportButton = page.getByRole("button", { name: /Download Export/i });
  await exportButton.scrollIntoViewIfNeeded();
  await expect(exportButton).toBeVisible();
});

test("admin dashboard shows live metrics and upload tools without fake approval controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Application Admin/i }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");

  await expect(page.getByRole("heading", { name: "Application Admin" })).toBeVisible();
  await expect(page.getByText("Total Requests")).toBeVisible();
  await expect(page.getByText("Pending Approvals")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload Company Data" })).toBeVisible();
  await expect(page.getByText("Johannesburg")).toBeVisible();
  await expect(page.getByText("Client Data Updates")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});
