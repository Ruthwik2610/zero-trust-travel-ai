import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.TUTORIAL_PORT || 3212);
const BASE_URL = process.env.TUTORIAL_BASE_URL || `http://127.0.0.1:${PORT}`;
const VIDEO_DIR = path.resolve(process.cwd(), "public/videos");
const WEBM_PATH = path.join(VIDEO_DIR, "unipro-travel-ai-tutorial.webm");
const MP4_PATH = path.join(VIDEO_DIR, "unipro-travel-ai-tutorial.mp4");
const AUDIO_PATH = path.join(VIDEO_DIR, "unipro-travel-ai-tutorial-voiceover.mp3");
const VOICED_MP4_PATH = path.join(VIDEO_DIR, "unipro-travel-ai-tutorial-voiced.mp4");
const ITINERARY_EXPORT_PATH = path.join(VIDEO_DIR, "tutorial-final-itinerary-export.xlsx");
const DOWNLOADED_ITINERARY_PATH = path.join(VIDEO_DIR, "downloaded-final-itinerary-proof.xlsx");
const OPTIONAL_WORKBOOK_PATH = process.env.TRAVEL_AI_TUTORIAL_WORKBOOK_PATH || "";
const SYNTHETIC_FORM_PATH = path.resolve(process.cwd(), "../docs/synthetic-forms/agent-upload-vikram-johannesburg.pdf");
const SYNTHETIC_POLICY_PATH = path.resolve(process.cwd(), "../docs/synthetic-forms/manager-company-policy.pdf");
const FALLBACK_WORKBOOK_PATH = path.resolve(process.cwd(), "../docs/synthetic-forms/manager-company-context.xlsx");
const TIME_SCALE = Number(process.env.TUTORIAL_TIME_SCALE || 1.45);
const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  "/opt/homebrew/opt/ffmpeg/bin/ffmpeg",
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/opt/ffmpeg/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/Applications/Kap.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg",
  "/Applications/Elmedia Player.app/Contents/Resources/ffmpeg",
  "/Applications/Stremio.app/Contents/MacOS/ffmpeg"
].filter(Boolean);
const FFPROBE_CANDIDATES = FFMPEG_CANDIDATES.map((candidate) => candidate.replace(/ffmpeg$/, "ffprobe"));
const narrationSegments = [];

function pause(ms) {
  return Math.round(ms * TIME_SCALE);
}

const agentAuthUser = {
  user_id: "usr_tutorial_agent",
  email: "demo.agent@unipro.com",
  role: "traveler",
  department: "travel_ops",
  scopes: ["travel:plan", "policy:read"],
  manager_scope: [],
  token_expires_at: Math.floor(Date.now() / 1000) + 900
};

const adminAuthUser = {
  user_id: "usr_tutorial_admin",
  email: "admin.user@unipro.com",
  role: "travel_manager",
  department: "travel_ops",
  scopes: ["admin:summary", "admin:audit", "travel:plan", "policy:read"],
  manager_scope: ["travel_ops"],
  token_expires_at: Math.floor(Date.now() / 1000) + 900
};

const baseRequest = {
  id: "corp_req_vikram_jnb",
  travellerName: "Vikram Rao",
  travellerEmail: "vikram.rao@acme.com",
  company: "Acme Infrastructure",
  origin: "Hyderabad",
  destination: "Johannesburg",
  departDate: "2026-06-10",
  returnDate: "2026-06-17",
  purpose: "Sales leadership meeting",
  preferences: "Hotel near Sandton office, morning arrival preferred",
  budgetAmount: 150000,
  budgetCurrency: "INR",
  specialRequests: "Vegetarian meals and airport pickup",
  status: "new",
  visaStatus: "attention",
  budgetStatus: "pending",
  approvalStatus: "Not Required",
  lastUpdated: "2026-05-22T10:42:00.000Z",
  originalRequest: "Vikram needs Hyderabad to Johannesburg for sales leadership meetings.",
  aiSummary: "Generate the complete travel plan to summarize this request.",
  readinessCheck: "Passport: Ready\nVisa: Needs Review\nMissing info: None",
  budgetPolicyCheck: "Budget: Needs Review\nPolicy: Needs Review\nApproval: Not required yet",
  recommendedPlans: [],
  flightOffers: [],
  selectedFlightOfferId: null,
  hotelOffers: [],
  selectedHotelOfferId: null,
  missingInformation: "",
  customerMessageDraft: "",
  finalItineraryDraft: "",
  finalApproved: false
};

const plannedRequest = {
  ...baseRequest,
  status: "planning",
  budgetStatus: "clear",
  approvalStatus: "Required",
  aiSummary: "Vikram can travel Hyderabad to Johannesburg with a one-stop route and a Sandton-area hotel inside the INR 150,000 planning target.",
  readinessCheck: "Passport: Ready\nVisa: Needs Review\nMissing info: None\nAction: confirm South Africa business visa documents before ticketing.",
  budgetPolicyCheck: "Budget: Within limit\nPolicy: Compliant with preferred hotel and economy cabin\nApproval: Required because international travel needs manager approval.",
  recommendedPlans: [
    {
      id: "plan-policy-fit",
      name: "Policy Fit",
      flightOfferId: "flight-qr-jnb",
      flightSummary: "Qatar Airways one-stop route with evening departure and morning arrival.",
      hotelSummary: "Sandton business hotel near the client office.",
      totalAmount: 143800,
      currency: "INR",
      policyFit: "Inside policy",
      tradeoffs: "Best balance of timing, policy, and budget.",
      selected: true
    },
    {
      id: "plan-lowest-cost",
      name: "Lowest Cost",
      flightOfferId: "flight-ek-jnb",
      flightSummary: "Longer one-stop connection with lower fare.",
      hotelSummary: "Rosebank value hotel with longer transfer.",
      totalAmount: 126900,
      currency: "INR",
      policyFit: "Inside policy",
      tradeoffs: "Cheaper, but farther from the office."
    },
    {
      id: "plan-fastest",
      name: "Fastest Comfortable",
      flightOfferId: "flight-et-jnb",
      flightSummary: "Fastest one-stop route with shorter layover.",
      hotelSummary: "Premium Sandton hotel.",
      totalAmount: 168500,
      currency: "INR",
      policyFit: "Approval required",
      tradeoffs: "Best timing, but over the target budget."
    }
  ],
  flightOffers: [
    {
      id: "flight-qr-jnb",
      provider: "Duffel",
      airline: "Qatar Airways",
      summary: "HYD to JNB via Doha, evening departure with morning arrival.",
      totalAmount: 143800,
      currency: "INR",
      outbound: "HYD 21:20 -> DOH 23:25, DOH 02:10 -> JNB 10:15",
      returnLeg: "JNB 13:35 -> DOH 23:05, DOH 02:00 -> HYD 08:20",
      cabin: "economy",
      expiresAt: "2026-05-23T13:30:00.000Z",
      source: "duffel",
      notes: ["Policy fit", "Sandton arrival timing works"],
      selected: true
    },
    {
      id: "flight-ek-jnb",
      provider: "Duffel",
      airline: "Emirates",
      summary: "HYD to JNB via Dubai with a longer connection.",
      totalAmount: 126900,
      currency: "INR",
      outbound: "HYD 04:35 -> DXB 07:05, DXB 14:40 -> JNB 20:50",
      returnLeg: "JNB 22:20 -> DXB 08:30, DXB 13:30 -> HYD 18:40",
      cabin: "economy",
      expiresAt: "2026-05-23T13:30:00.000Z",
      source: "duffel",
      notes: ["Lowest cost", "Longer layover"]
    },
    {
      id: "flight-et-jnb",
      provider: "Duffel",
      airline: "Ethiopian Airlines",
      summary: "HYD to JNB via Addis Ababa with shorter layover.",
      totalAmount: 168500,
      currency: "INR",
      outbound: "HYD 03:30 -> ADD 07:10, ADD 09:00 -> JNB 13:05",
      returnLeg: "JNB 14:30 -> ADD 20:25, ADD 23:50 -> HYD 08:10",
      cabin: "economy",
      expiresAt: "2026-05-23T13:30:00.000Z",
      source: "duffel",
      notes: ["Fastest connection", "Approval required"]
    }
  ],
  selectedFlightOfferId: "flight-qr-jnb",
  hotelOffers: [
    {
      id: "hotel-sandton-business",
      provider: "Booking.com",
      name: "Sandton Business Hotel",
      summary: "4-star Sandton hotel near the client office with breakfast and invoice support.",
      totalAmount: 51800,
      currency: "INR",
      address: "Sandton, Johannesburg",
      starRating: 4,
      checkIn: "2026-06-10",
      checkOut: "2026-06-17",
      nights: 7,
      rooms: 1,
      guests: 1,
      imageUrl: "/travel-media/hotel-business.png",
      source: "booking",
      notes: ["Near office", "Refundable corporate rate"],
      selected: true
    },
    {
      id: "hotel-rosebank-flex",
      provider: "Booking.com",
      name: "Rosebank Flexible Stay",
      summary: "Flexible corporate stay with stronger cancellation posture and a longer transfer.",
      totalAmount: 46200,
      currency: "INR",
      address: "Rosebank, Johannesburg",
      starRating: 4,
      checkIn: "2026-06-10",
      checkOut: "2026-06-17",
      nights: 7,
      rooms: 1,
      guests: 1,
      imageUrl: "/travel-media/hotel-city.png",
      source: "booking",
      notes: ["Flexible cancellation"]
    },
    {
      id: "hotel-premium-lobby",
      provider: "Planning option",
      name: "Sandton Executive Lobby",
      summary: "Premium Sandton hotel with fastest client-office transfer.",
      totalAmount: 61200,
      currency: "INR",
      address: "Sandton, Johannesburg",
      starRating: 5,
      checkIn: "2026-06-10",
      checkOut: "2026-06-17",
      nights: 7,
      rooms: 1,
      guests: 1,
      imageUrl: "/travel-media/hotel-lobby.png",
      source: "synthetic",
      notes: ["Approval likely"]
    }
  ],
  selectedHotelOfferId: "hotel-sandton-business",
  customerMessageDraft: "Hi Vikram, I prepared a policy-fit option for Hyderabad to Johannesburg with visa review and approval notes.",
  finalItineraryDraft: "Draft itinerary: Hyderabad to Johannesburg, Jun 10-Jun 17, policy-fit flight plus Sandton hotel."
};

const finalizedRequest = {
  ...plannedRequest,
  status: "finalized",
  approvalStatus: "Received",
  finalApproved: true,
  finalItineraryDraft: "Final itinerary ready for export. No booking has been created."
};

const createdRequest = {
  ...baseRequest,
  id: "corp_req_priya_ber",
  travellerName: "Priya Menon",
  travellerEmail: "priya.menon@orbitex.com",
  company: "Orbitex Cloud",
  origin: "Bengaluru",
  destination: "Berlin",
  departDate: "2026-07-08",
  returnDate: "2026-07-13",
  purpose: "Partner onboarding workshop",
  preferences: "Hotel near Mitte office, vegetarian meals",
  budgetAmount: 2200,
  budgetCurrency: "EUR",
  specialRequests: "Late check-in and quiet room",
  visaStatus: "pending",
  approvalStatus: "Not Required",
  originalRequest: "Priya needs Bengaluru to Berlin for partner onboarding.",
  readinessCheck: "Passport: Ready\nVisa: Needs Review\nMissing info: hotel loyalty number",
  budgetPolicyCheck: "Budget: Needs Review\nPolicy: Needs Review\nApproval: Not required yet"
};

const queueRequests = [
  baseRequest,
  {
    ...plannedRequest,
    id: "corp_req_mira_lhr",
    travellerName: "Mira Kapoor",
    travellerEmail: "mira.kapoor@acme.com",
    origin: "Mumbai",
    destination: "London",
    status: "pending_approval",
    visaStatus: "clear",
    approvalStatus: "Required",
    lastUpdated: "2026-05-22T09:15:00.000Z"
  },
  {
    ...baseRequest,
    id: "corp_req_anika_sin",
    travellerName: "Anika Shah",
    travellerEmail: "anika.shah@northstar.com",
    company: "Northstar Energy",
    origin: "Delhi",
    destination: "Singapore",
    status: "missing_info",
    missingInformation: "Passport expiry and mobile number required.",
    visaStatus: "pending",
    budgetStatus: "clear",
    approvalStatus: "Not Required"
  }
];

const travelers = [
  {
    id: "traveler_vikram",
    name: "Vikram Rao",
    email: "vikram.rao@acme.com",
    company: "Acme Infrastructure",
    department: "Sales",
    vip_level: "Gold",
    status: "Visa Review",
    location: "Hyderabad",
    seat_preference: "Aisle",
    meal_preference: "Vegetarian",
    hotel_preference: "Near client office",
    policy_notes: ["South Africa business visa must be confirmed before final ticketing."],
    loyalty_programs: [{ provider: "Qatar Privilege Club", tier: "Silver", account_ref: "On file" }],
    documents: [{ document_type: "passport", label: "Passport", status: "Ready", redacted_value: "P••••9421" }],
    recent_trips: ["Hyderabad to Dubai", "Hyderabad to Singapore"],
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z"
  },
  {
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
    hotel_preference: "Close to office",
    policy_notes: ["Passport expiry is missing."],
    loyalty_programs: [],
    documents: [{ document_type: "passport", label: "Passport", status: "Missing", redacted_value: null }],
    recent_trips: ["Delhi to Singapore"],
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z"
  }
];

const policies = [
  {
    id: "policy_global_travel_2024",
    client_name: "Global Travel Policy",
    status: "active",
    compliance_score: 91,
    active_rules: [
      { label: "International approval", value: "Required for all cross-border travel" },
      { label: "Hotel cap", value: "Prefer business hotels near meeting location" },
      { label: "Cabin", value: "Economy unless pre-approved" }
    ]
  },
  {
    id: "policy_acme_sales",
    client_name: "Acme Sales Travel",
    status: "review",
    compliance_score: 84,
    active_rules: [
      { label: "Approval threshold", value: "Manager approval above INR 150,000" },
      { label: "Visa", value: "Document review before itinerary finalization" }
    ]
  }
];

function startServer() {
  if (process.env.TUTORIAL_BASE_URL) return null;
  const server = spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TRAVEL_AI_API_INTERNAL_URL: "http://127.0.0.1:8100" }
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[tutorial-server] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[tutorial-server] ${chunk}`));
  return server;
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Travel AI frontend did not start at ${BASE_URL}`);
}

async function mockBackend(page) {
  let requests = queueRequests.map((request) => ({ ...request }));
  let companyStatuses = [
    {
      company_name: "Acme Infrastructure",
      traveler_count: 2,
      traveler_list_status: "Updated",
      policy_status: "Uploaded",
      policy_count: 1,
      visa_record_count: 2,
      history_row_count: 4
    },
    {
      company_name: "Orbitex Cloud",
      traveler_count: 0,
      traveler_list_status: "Missing",
      policy_status: "Missing",
      policy_count: 0,
      visa_record_count: 0,
      history_row_count: 0
    }
  ];
  const requestFromUrl = (url) => {
    const id = decodeURIComponent(url.match(/\/api\/corporate\/requests\/([^/]+)/)?.[1] || "");
    return requests.find((request) => request.id === id) || requests[0];
  };

  await page.route("**/api/auth/demo-login", async (route) => {
    const body = route.request().postDataJSON?.();
    const user = body?.username === "admin" ? adminAuthUser : agentAuthUser;
    await route.fulfill({
      json: {
        access_token: "tutorial-token",
        token_type: "bearer",
        expires_at: user.token_expires_at,
        user: { ...user, email: body?.email || user.email }
      }
    });
  });
  await page.route("**/api/corporate/requests", async (route) => {
    if (route.request().method() === "POST") {
      requests = [createdRequest, ...requests.filter((request) => request.id !== createdRequest.id)];
      await route.fulfill({ status: 201, json: createdRequest });
      return;
    }
    await route.fulfill({ json: requests });
  });
  await page.route("**/api/corporate/requests/*/plan", async (route) => {
    const current = requestFromUrl(route.request().url());
    const planned = { ...plannedRequest, id: current.id, travellerName: current.travellerName, travellerEmail: current.travellerEmail, company: current.company };
    requests = requests.map((request) => request.id === current.id ? planned : request);
    await route.fulfill({ json: planned });
  });
  await page.route("**/api/corporate/requests/*/finalize", async (route) => {
    const current = requestFromUrl(route.request().url());
    const finalized = { ...finalizedRequest, id: current.id, travellerName: current.travellerName, travellerEmail: current.travellerEmail, company: current.company };
    requests = requests.map((request) => request.id === current.id ? finalized : request);
    await route.fulfill({ json: finalized });
  });
  await page.route("**/api/corporate/requests/*/critical-issue", async (route) => {
    const body = route.request().postDataJSON?.() || {};
    const current = requestFromUrl(route.request().url());
    const updated = {
      ...plannedRequest,
      ...current,
      criticalIssue: body.issue || "Flight cancelled - book an alternative from the same origin and adjust hotel dates if needed.",
      criticalIssueStatus: body.status || "Urgent",
      flightOffers: plannedRequest.flightOffers,
      hotelOffers: plannedRequest.hotelOffers,
      selectedFlightOfferId: plannedRequest.selectedFlightOfferId,
      selectedHotelOfferId: plannedRequest.selectedHotelOfferId,
      recommendedPlans: plannedRequest.recommendedPlans
    };
    requests = requests.map((request) => request.id === current.id ? updated : request);
    await route.fulfill({ json: updated });
  });
  await page.route("**/api/corporate/requests/*/notifications", async (route) => {
    await route.fulfill({
      json: {
        id: "email_tutorial_approval",
        request_id: plannedRequest.id,
        kind: "approval_request",
        provider: "tutorial",
        status: "sent",
        to: [plannedRequest.travellerEmail],
        subject: "Approval requested",
        provider_message_id: "tutorial-message",
        safe_message: "Approval email accepted for tutorial.",
        created_at: "2026-05-22T10:55:00.000Z"
      }
    });
  });
  await page.route("**/api/corporate/requests/*/export.xlsx", async (route) => {
    await route.fulfill({
      body: await readFile(ITINERARY_EXPORT_PATH),
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": "attachment; filename=tutorial-itinerary.xlsx"
      }
    });
  });
  await page.route("**/api/corporate/excel-template", async (route) => {
    await route.fulfill({
      body: Buffer.from("Tutorial template placeholder"),
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": "attachment; filename=corporate-template.xlsx"
      }
    });
  });
  await page.route("**/api/corporate/requests/upload-excel", async (route) => {
    requests = [createdRequest, ...requests.filter((request) => request.id !== createdRequest.id)];
    companyStatuses = companyStatuses.map((company) => company.company_name === "Orbitex Cloud"
      ? { ...company, traveler_count: 1, traveler_list_status: "Updated", visa_record_count: 1, history_row_count: 1 }
      : company);
    await route.fulfill({
      json: {
        request_count: 1,
        total_rows: 1,
        skipped_rows: 0,
        employee_profile_count: 1,
        created_request_ids: [createdRequest.id]
      }
    });
  });
  await page.route("**/api/corporate/company-policy/upload-pdf", async (route) => {
    companyStatuses = companyStatuses.map((company) => company.company_name === "Orbitex Cloud"
      ? { ...company, policy_status: "Uploaded", policy_count: 1 }
      : company);
    await route.fulfill({
      json: {
        company_name: "Orbitex Cloud",
        policy_count: 1,
        rules: ["Approval required for international travel and disruption recovery."]
      }
    });
  });
  await page.route("**/api/corporate/companies", async (route) => {
    await route.fulfill({ json: companyStatuses });
  });
  await page.route("**/api/agent/chat", async (route) => {
    await route.fulfill({
      json: {
        message: "Visa review is the main blocker. The budget is inside target, and the approval packet can be sent once documents are confirmed.",
        model: "tutorial-demo",
        audit_events: []
      }
    });
  });
  await page.route("**/api/corporate/admin/summary", async (route) => {
    await route.fulfill({
      json: {
        total_requests: 38,
        by_status: { New: 12, "Missing Info": 4, "Waiting for Approval": 9, Finalized: 13 },
        approval_required: 9,
        visa_issues: 5,
        finalized: 13,
        average_handling_time_hours: 3.2,
        common_destinations: [
          { destination: "Johannesburg", count: 12 },
          { destination: "Singapore", count: 9 },
          { destination: "London", count: 7 }
        ]
      }
    });
  });
  await page.route("**/api/admin/audit", async (route) => {
    await route.fulfill({
      json: [
        { id: "audit_1", actor: "Aisha Singh", action: "Policy rows imported", created_at: "2026-05-22T09:00:00.000Z" },
        { id: "audit_2", actor: "System", action: "Approval request sent", created_at: "2026-05-22T09:30:00.000Z" }
      ]
    });
  });
  await page.route("**/api/travelers", async (route) => {
    await route.fulfill({ json: travelers });
  });
  await page.route("**/api/travelers/*", async (route) => {
    const id = route.request().url().split("/").pop();
    await route.fulfill({ json: travelers.find((traveler) => traveler.id === id) || travelers[0] });
  });
  await page.route("**/api/policies", async (route) => {
    await route.fulfill({ json: policies });
  });
  await page.route("**/api/policies/*/activity", async (route) => {
    await route.fulfill({
      json: [
        { id: "activity_1", actor: "Aisha Singh", action: "Policy imported", created_at: "2026-05-22T08:30:00.000Z" },
        { id: "activity_2", actor: "System", action: "Visa rule updated", created_at: "2026-05-22T09:10:00.000Z" }
      ]
    });
  });
  await page.route("**/api/policies/*", async (route) => {
    const id = route.request().url().split("/").at(-1);
    await route.fulfill({ json: policies.find((policy) => policy.id === id) || policies[0] });
  });
}

async function installOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById("tutorial-overlay-root")) return;
    const style = document.createElement("style");
    style.textContent = `
      .tutorial-caption {
        position: fixed;
        left: 30px;
        bottom: 28px;
        z-index: 2147483000;
        width: min(520px, calc(100vw - 60px));
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.28);
        background: linear-gradient(135deg, rgba(15, 52, 64, 0.98), rgba(23, 74, 92, 0.94));
        color: white;
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
        padding: 18px 20px;
        pointer-events: none;
      }
      .tutorial-caption span {
        display: block;
        margin-bottom: 7px;
        color: #a7f3d0;
        font-size: 0.76rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .tutorial-caption strong {
        display: block;
        font-size: 1.18rem;
        line-height: 1.16;
      }
      .tutorial-caption p {
        margin: 8px 0 0;
        color: rgba(255,255,255,0.84);
        font-size: 0.94rem;
        line-height: 1.42;
      }
      .tutorial-spotlight {
        position: fixed;
        z-index: 2147482999;
        border: 3px solid #2f8f6f;
        border-radius: 14px;
        background: rgba(47, 143, 111, 0.12);
        box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.08);
        opacity: 0;
        transition: opacity 180ms ease;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.id = "tutorial-overlay-root";
    root.innerHTML = `
      <section class="tutorial-caption" aria-hidden="true"><span></span><strong></strong><p></p></section>
      <div class="tutorial-spotlight" aria-hidden="true"></div>
    `;
    document.body.appendChild(root);
  });
}

async function caption(page, step, title, body, ms = 1300) {
  narrationSegments.push({ step, title, body });
  await installOverlay(page);
  await page.evaluate(({ step, title, body }) => {
    document.querySelector(".tutorial-caption span").textContent = step;
    document.querySelector(".tutorial-caption strong").textContent = title;
    document.querySelector(".tutorial-caption p").textContent = body;
  }, { step, title, body });
  await page.waitForTimeout(pause(ms));
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xmlDecode(value) {
  return htmlEscape(value)
    .replaceAll("&amp;lt;", "&lt;")
    .replaceAll("&amp;gt;", "&gt;")
    .replaceAll("&amp;amp;", "&amp;")
    .replaceAll("&amp;quot;", "&quot;")
    .replaceAll("&amp;apos;", "'");
}

function unzipText(file, entry) {
  const result = spawnSync("unzip", ["-p", file, entry], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return result.status === 0 ? result.stdout : "";
}

function columnIndex(cellRef) {
  const letters = String(cellRef || "").replace(/\d/g, "");
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

function parseWorkbookPreview(file, maxSheets = 3, maxRows = 6) {
  const workbookXml = unzipText(file, "xl/workbook.xml");
  const relsXml = unzipText(file, "xl/_rels/workbook.xml.rels");
  const sharedXml = unzipText(file, "xl/sharedStrings.xml");
  const sharedStrings = [...sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => (
    [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlDecode(part[1])).join("")
  ));
  const rels = new Map(
    [...relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
      .map((match) => [match[1], match[2].replace(/^\/?xl\//, "")])
  );
  const sheets = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*(?:r:id|id)="([^"]+)"/g)].slice(0, maxSheets);
  return sheets.map((sheetMatch) => {
    const name = xmlDecode(sheetMatch[1]);
    const target = rels.get(sheetMatch[2]) || `worksheets/sheet${sheets.indexOf(sheetMatch) + 1}.xml`;
    const sheetXml = unzipText(file, `xl/${target}`);
    const rows = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, maxRows).map((rowMatch) => {
      const values = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c[^>]*r="([^"]+)"[^>]*(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
        const [, ref, type, cellXml] = cellMatch;
        const inline = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
        const raw = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? inline ?? "";
        const value = type === "s" ? sharedStrings[Number(raw)] || "" : xmlDecode(raw);
        values[columnIndex(ref)] = value;
      }
      return values.map((value) => value || "");
    }).filter((row) => row.some(Boolean));
    return { name, rows };
  }).filter((sheet) => sheet.rows.length);
}

async function parsePdfPreview(file, maxLines = 9) {
  const content = await readFile(file, "latin1");
  return [...content.matchAll(/\(([^)]{2,})\)\s*Tj/g)]
    .map((match) => match[1].replace(/\\([()\\])/g, "$1").trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

function workbookSections(file, label) {
  const sheets = parseWorkbookPreview(file);
  return sheets.length ? sheets.map((sheet) => ({
    heading: `${label}: ${sheet.name}`,
    rows: sheet.rows
  })) : [{ heading: label, lines: ["Workbook preview unavailable, but the file was selected for upload."] }];
}

async function showProofPreview(page, step, title, subtitle, sections, ms = 2600) {
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          body { margin: 0; background: #f4f7f8; color: #122126; }
          .proof-shell { padding: 44px; display: grid; gap: 24px; }
          .proof-head { display: grid; gap: 8px; max-width: 1040px; }
          .proof-head span { color: #2f8f6f; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; font-size: .78rem; }
          .proof-head h1 { margin: 0; font-size: 2.1rem; letter-spacing: 0; }
          .proof-head p { margin: 0; color: #526268; line-height: 1.5; font-size: 1rem; }
          .proof-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; align-items: start; }
          .proof-card { border: 1px solid #dbe5e8; background: #fff; border-radius: 8px; padding: 18px; box-shadow: 0 16px 34px rgba(18,33,38,.08); overflow: hidden; }
          .proof-card h2 { margin: 0 0 12px; font-size: 1.05rem; }
          .proof-card ul { margin: 0; padding-left: 18px; display: grid; gap: 8px; color: #35494f; }
          table { width: 100%; border-collapse: collapse; font-size: .82rem; }
          td { border-bottom: 1px solid #e8eef0; padding: 7px 8px; color: #24373d; vertical-align: top; }
          tr:first-child td { background: #eff7f4; color: #173f34; font-weight: 800; }
        </style>
      </head>
      <body>
        <main class="proof-shell">
          <section class="proof-head">
            <span>${htmlEscape(step)}</span>
            <h1>${htmlEscape(title)}</h1>
            <p>${htmlEscape(subtitle)}</p>
          </section>
          <section class="proof-grid">
            ${sections.map((section) => `
              <article class="proof-card">
                <h2>${htmlEscape(section.heading)}</h2>
                ${section.rows ? `
                  <table>
                    <tbody>
                      ${section.rows.map((row) => `<tr>${row.slice(0, 8).map((cell) => `<td>${htmlEscape(cell)}</td>`).join("")}</tr>`).join("")}
                    </tbody>
                  </table>
                ` : `
                  <ul>${(section.lines || []).map((line) => `<li>${htmlEscape(line)}</li>`).join("")}</ul>
                `}
              </article>
            `).join("")}
          </section>
        </main>
      </body>
    </html>
  `);
  await page.waitForLoadState("load");
  await caption(page, step, title, subtitle, ms);
}

async function createItineraryExportWorkbook() {
  const python = [
    path.resolve(process.cwd(), "../backend/.venv/bin/python"),
    "/usr/bin/python3",
    "python3"
  ].find((candidate) => {
    const check = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    return check.status === 0;
  });
  if (!python) {
    await writeFile(ITINERARY_EXPORT_PATH, "Traveler,Route,Flight,Hotel,Approval\nVikram Rao,Hyderabad to Johannesburg,Qatar Airways,Sandton Business Hotel,Received\n");
    return ITINERARY_EXPORT_PATH;
  }
  const script = `
from openpyxl import Workbook
from sys import argv
wb = Workbook()
ws = wb.active
ws.title = "Final Itinerary"
ws.append(["Traveler", "Company", "Route", "Dates", "Approval", "Export status"])
ws.append(["Vikram Rao", "Acme Infrastructure", "Hyderabad to Johannesburg", "Jun 10-Jun 17, 2026", "Received", "Ready for manager review"])
flight = wb.create_sheet("Selected Flight")
flight.append(["Airline", "Outbound", "Return", "Source", "Cost"])
flight.append(["Qatar Airways", "HYD 21:20 -> DOH 23:25, DOH 02:10 -> JNB 10:15", "JNB 13:35 -> DOH 23:05, DOH 02:00 -> HYD 08:20", "Duffel", "INR 143800"])
hotel = wb.create_sheet("Selected Hotel")
hotel.append(["Hotel", "Address", "Nights", "Source", "Cost"])
hotel.append(["Sandton Business Hotel", "Sandton, Johannesburg", "7", "Booking.com", "INR 51800"])
notes = wb.create_sheet("Traveler Notes")
notes.append(["Important note"])
notes.append(["No booking is claimed from this export; agent review and provider booking remain explicit steps."])
wb.save(argv[1])
`;
  const result = spawnSync(python, ["-c", script, ITINERARY_EXPORT_PATH], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not create tutorial itinerary workbook: ${result.stderr || result.stdout}`);
  return ITINERARY_EXPORT_PATH;
}

async function spotlight(page, locator, ms = 900) {
  await installOverlay(page);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) return;
  await page.evaluate(({ box }) => {
    const node = document.querySelector(".tutorial-spotlight");
    const pad = 8;
    node.style.left = `${Math.max(8, box.x - pad)}px`;
    node.style.top = `${Math.max(8, box.y - pad)}px`;
    node.style.width = `${box.width + pad * 2}px`;
    node.style.height = `${box.height + pad * 2}px`;
    node.style.opacity = "1";
  }, { box });
  await page.waitForTimeout(pause(ms));
}

async function hideSpotlight(page) {
  await page.evaluate(() => {
    const node = document.querySelector(".tutorial-spotlight");
    if (node) node.style.opacity = "0";
  }).catch(() => undefined);
}

async function guidedClick(page, locator, ms = 900) {
  await spotlight(page, locator, 450);
  await locator.click();
  await hideSpotlight(page);
  await page.waitForTimeout(pause(ms));
}

async function guidedFill(page, locator, value, ms = 500) {
  await spotlight(page, locator, 250);
  await locator.fill(value);
  await hideSpotlight(page);
  await page.waitForTimeout(pause(ms));
}

async function guidedType(page, locator, value, ms = 500) {
  await spotlight(page, locator, 250);
  await locator.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.pressSequentially(value, { delay: pause(22) });
  await hideSpotlight(page);
  await page.waitForTimeout(pause(ms));
}

async function findFfmpeg() {
  for (const candidate of FFMPEG_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

async function findFfprobe() {
  for (const candidate of FFPROBE_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

async function convertToMp4() {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) return null;
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-y", "-i", WEBM_PATH,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      MP4_PATH
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.on("data", (chunk) => process.stderr.write(`[ffmpeg] ${chunk}`));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
  });
  return MP4_PATH;
}

async function loadLocalEnv() {
  for (const file of [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), "../.env.local")]) {
    try {
      const content = await readFile(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        if (key && value && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // Local env files are optional.
    }
  }
}

function narrationText() {
  return narrationSegments
    .map(({ step, title, body }) => `${step}. ${title}. ${body}`)
    .join("\n\n");
}

async function resolveElevenLabsVoiceId(apiKey) {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey }
  });
  if (!response.ok) throw new Error(`ElevenLabs voices request failed with ${response.status}`);
  const data = await response.json();
  const voices = Array.isArray(data.voices) ? data.voices : [];
  const preferred = voices.find((voice) => /rachel|aria|george|adam/i.test(voice.name || "")) || voices[0];
  if (!preferred?.voice_id) throw new Error("No ElevenLabs voice is available for this API key");
  return preferred.voice_id;
}

async function generateVoiceover() {
  await loadLocalEnv();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const voiceId = await resolveElevenLabsVoiceId(apiKey);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "accept": "audio/mpeg",
      "content-type": "application/json",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: narrationText(),
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.12,
        use_speaker_boost: true
      }
    })
  });
  if (!response.ok) throw new Error(`ElevenLabs speech request failed with ${response.status}`);
  await writeFile(AUDIO_PATH, Buffer.from(await response.arrayBuffer()));
  return AUDIO_PATH;
}

async function mediaDuration(file) {
  const ffprobe = await findFfprobe();
  if (!ffprobe) return null;
  return new Promise((resolve) => {
    const child = spawn(ffprobe, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file
    ], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      const duration = Number.parseFloat(output.trim());
      resolve(code === 0 && Number.isFinite(duration) ? duration : null);
    });
    child.on("error", () => resolve(null));
  });
}

async function muxSyncedVoiceover(videoPath, audioPath) {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) return null;
  const videoDuration = await mediaDuration(videoPath);
  const audioDuration = await mediaDuration(audioPath);
  const speedRatio = videoDuration && audioDuration ? Math.max(0.35, Math.min(3.5, audioDuration / videoDuration)) : 1;
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-filter_complex", `[0:v]setpts=${speedRatio.toFixed(6)}*PTS[v]`,
      "-map", "[v]",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-shortest",
      VOICED_MP4_PATH
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.on("data", (chunk) => process.stderr.write(`[ffmpeg] ${chunk}`));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
  });
  return VOICED_MP4_PATH;
}

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next fixture.
    }
  }
  throw new Error(`None of the tutorial fixtures exist: ${paths.join(", ")}`);
}

async function main() {
  await mkdir(VIDEO_DIR, { recursive: true });
  const server = startServer();
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
      acceptDownloads: true
    });
    const page = await context.newPage();
    await createItineraryExportWorkbook();
    await mockBackend(page);
    const agentFormFixture = await firstExisting([SYNTHETIC_FORM_PATH]);
    const workbookFixture = await firstExisting([FALLBACK_WORKBOOK_PATH, OPTIONAL_WORKBOOK_PATH].filter(Boolean));
    const policyFixture = await firstExisting([SYNTHETIC_POLICY_PATH]);

    await page.goto(BASE_URL);
    await page.waitForLoadState("load");
    await caption(page, "Agent Workflow 1", "Sign in as the travel agent", "The tutorial starts with the operational user. Agents can plan and recover trips, but they cannot switch into admin data screens.", 1800);
    await guidedClick(page, page.getByRole("button", { name: /Continue to workspace/i }), 1000);

    await page.getByRole("heading", { name: "Travel Operations" }).waitFor();
    await caption(page, "Agent Workflow 2", "Triage the pending queue", "The agent sees one queue search, stage filters, and critical-issue controls. Every visible control maps to triage, intake, planning, recovery, approval, or export.", 1900);
    await spotlight(page, page.locator(".requests-page"), 1300);
    await hideSpotlight(page);

    await caption(page, "Agent Workflow 3", "Upload travel forms into pending", "PDF travel forms feed the pending queue. This simulates the agent or manager uploading request forms instead of manually creating every request.", 1800);
    await showProofPreview(page, "Proof 1", "Travel form PDF preview", "Before upload, the video shows the synthetic PDF content that becomes a pending request.", [
      { heading: path.basename(agentFormFixture), lines: await parsePdfPreview(agentFormFixture) }
    ], 2300);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole("heading", { name: "Travel Operations" }).waitFor();
    await page.getByLabel("Upload travel forms").setInputFiles(agentFormFixture);
    await guidedClick(page, page.getByRole("button", { name: "Import Forms" }), 1000);
    await page.getByRole("status").waitFor();

    await caption(page, "Agent Workflow 4", "Filter by operational stage", "The agent can isolate missing details, return to pending, and search for the traveler before opening the guided workspace.", 1500);
    await guidedClick(page, page.locator(".queue-tabs").getByRole("button", { name: /Needs Details/i }), 800);
    await guidedClick(page, page.locator(".queue-tabs").getByRole("button", { name: /Pending/i }), 700);
    await guidedType(page, page.getByRole("textbox", { name: "Search requests" }), "Vikram", 800);
    await spotlight(page, page.getByText("Vikram Rao").first(), 900);
    await hideSpotlight(page);
    await guidedFill(page, page.getByRole("textbox", { name: "Search requests" }), "", 500);

    await caption(page, "Agent Workflow 5", "Create a request manually when needed", "Manual intake remains available for calls or emails: traveler, company, route, dates, budget, purpose, preferences, and special requests.", 1600);
    await guidedClick(page, page.getByRole("button", { name: /New Request/i }), 700);
    const requestForm = page.locator("form.request-form");
    await guidedType(page, requestForm.getByRole("textbox", { name: "Traveller name" }), createdRequest.travellerName, 450);
    await guidedType(page, requestForm.getByRole("textbox", { name: "Traveller email" }), createdRequest.travellerEmail, 450);
    await guidedType(page, requestForm.getByRole("textbox", { name: "Company" }), createdRequest.company, 450);
    await guidedType(page, requestForm.getByRole("textbox", { name: "Origin" }), createdRequest.origin, 350);
    await guidedType(page, requestForm.getByRole("textbox", { name: "Destination" }), createdRequest.destination, 350);
    await guidedFill(page, requestForm.getByLabel("Depart date"), createdRequest.departDate, 300);
    await guidedFill(page, requestForm.getByLabel("Return date"), createdRequest.returnDate, 300);
    await guidedFill(page, requestForm.getByLabel("Budget"), String(createdRequest.budgetAmount), 300);
    await guidedType(page, requestForm.getByRole("textbox", { name: "Travel purpose" }), createdRequest.purpose, 500);
    await guidedType(page, requestForm.getByRole("textbox", { name: "Other preference details" }), createdRequest.preferences, 500);
    await guidedType(page, requestForm.getByRole("textbox", { name: "Other special request details" }), createdRequest.specialRequests, 500);
    await guidedClick(page, requestForm.getByRole("button", { name: /Create Request/i }), 1000);
    if (await requestForm.isVisible().catch(() => false)) {
      await requestForm.evaluate((form) => form.requestSubmit());
    }
    await page.getByText(createdRequest.travellerName).first().waitFor({ timeout: 10_000 });

    await caption(page, "Agent Workflow 6", "Open the guided itinerary builder", "The old side chat is gone. The builder now guides the agent inline through missing information, flights, hotels, itinerary, and approval/export.", 1700);
    await guidedClick(page, page.getByRole("button", { name: /Back to Requests/i }), 700);
    await guidedType(page, page.getByRole("textbox", { name: "Search requests" }), "Vikram", 500);
    await guidedClick(page, page.getByRole("button", { name: /corp_req_vikram_jnb Next:/i }), 700);
    await spotlight(page, page.locator(".builder-stepper"), 1000);
    await hideSpotlight(page);

    await caption(page, "Agent Workflow 7", "Generate flight and hotel options", "Generate Options loads provider-backed or planning options. Flights and hotels appear as cards with images, prices, provider source, and selection state.", 1800);
    await guidedClick(page, page.getByRole("button", { name: /Generate Options/i }), 1500);
    await page.getByText("Plan generated for agent review.").waitFor();
    await guidedClick(page, page.getByRole("button", { name: /Flights/i }), 900);
    await spotlight(page, page.getByAltText(/Qatar Airways flight visual/i), 1000);
    await hideSpotlight(page);
    await guidedType(page, page.getByRole("textbox", { name: "Guide command for Flights" }), "Compare policy-compliant options and explain the blocker.", 900);
    await guidedClick(page, page.getByRole("button", { name: "Update Step" }), 1200);

    await caption(page, "Agent Workflow 8", "Choose hotel after flight", "The same guided path moves the agent to hotel selection. The chosen flight is carried into the hotel recommendation context.", 1600);
    await guidedClick(page, page.getByRole("button", { name: /Next: Select Hotel/i }), 900);
    await spotlight(page, page.getByAltText(/Sandton Business Hotel hotel visual/i), 1000);
    await hideSpotlight(page);
    await guidedClick(page, page.getByRole("button", { name: "Select Hotel" }).first(), 900);

    await caption(page, "Agent Workflow 9", "Review itinerary and helper guidance", "The inline helper explains the current step and can apply a suggested update into the same builder, without opening a separate chat tab.", 1700);
    await guidedClick(page, page.getByRole("button", { name: /Next: Review Itinerary/i }), 900);
    await guidedClick(page, page.getByRole("button", { name: /Help me understand/i }), 900);
    await spotlight(page, page.getByRole("dialog", { name: "Helper explanation" }), 1200);
    await hideSpotlight(page);
    await guidedClick(page, page.getByRole("button", { name: "Close" }), 500);

    await caption(page, "Agent Workflow 10", "Send approval and export", "Approval, final itinerary generation, and export sit in the final guided step. No ticket or hotel booking is claimed from this screen.", 1700);
    await guidedClick(page, page.getByRole("button", { name: /Next: Approval & Export/i }), 900);
    await guidedClick(page, page.getByRole("button", { name: /^Send Approval$/i }), 900);
    await page.getByLabel("Approval status").selectOption("Received");
    await guidedClick(page, page.getByRole("button", { name: /^Save$/i }), 700);
    await guidedClick(page, page.getByRole("button", { name: /Generate Final Itinerary/i }), 1200);
    const exportDownload = page.waitForEvent("download");
    await guidedClick(page, page.getByRole("button", { name: /Download Export/i }), 900);
    const itineraryDownload = await exportDownload;
    await itineraryDownload.saveAs(DOWNLOADED_ITINERARY_PATH);
    await showProofPreview(page, "Proof 2", "Downloaded itinerary preview", "The downloaded itinerary workbook is opened as evidence, showing final itinerary, selected flight, selected hotel, and approval state.", [
      ...workbookSections(DOWNLOADED_ITINERARY_PATH, path.basename(DOWNLOADED_ITINERARY_PATH)),
      { heading: "Downloaded file", lines: [`Saved as ${path.basename(DOWNLOADED_ITINERARY_PATH)}`, "This is the export produced by the workflow after final approval."] }
    ], 2900);

    await caption(page, "Recovery Workflow", "Handle a critical issue from the queue", "When a flight is cancelled, the agent marks the request urgent and lands directly in the recovery flight step to pick a same-origin alternative and adjust hotels.", 1900);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole("heading", { name: "Travel Operations" }).waitFor();
    await page.getByLabel("Critical issue for corp_req_mira_lhr").selectOption({ label: "Flight cancelled" });
    await page.getByText("Choose the recovery flight").waitFor();
    await guidedType(page, page.getByRole("textbox", { name: "Guide command for Flights" }), "Find the fastest same-origin recovery and adjust the hotel if dates change.", 900);
    await guidedClick(page, page.getByRole("button", { name: "Update Step" }), 1200);

    await caption(page, "Admin Workflow 1", "Sign in as the manager", "Managers own company data: traveler rosters, policies, history, visa records, and company readiness. Agent users are not allowed to jump into this dashboard.", 1700);
    await guidedClick(page, page.getByRole("button", { name: /Sign out/i }), 900);
    await page.waitForURL("**/");
    await guidedClick(page, page.getByRole("button", { name: /Application Admin/i }), 500);
    await guidedClick(page, page.getByRole("button", { name: /Continue to workspace/i }), 900);
    await page.waitForURL("**/admin");
    await page.getByRole("heading", { name: "Application Admin" }).waitFor();
    await spotlight(page, page.locator(".admin-metric-grid"), 1200);
    await hideSpotlight(page);

    await caption(page, "Admin Workflow 2", "Upload the company traveler workbook", "This uses the attached Corporate Travel Profile Dataset workbook. The company pipeline updates traveler list readiness separately from policy readiness.", 1800);
    await showProofPreview(page, "Proof 3", "Excel workbook preview", "Before manager upload, the video previews the actual workbook sheets used to seed traveler, visa, hotel, flight, and history context.", workbookSections(workbookFixture, path.basename(workbookFixture)), 3200);
    await page.goto(`${BASE_URL}/admin`);
    await page.getByRole("heading", { name: "Application Admin" }).waitFor();
    const templateDownload = page.waitForEvent("download");
    await guidedClick(page, page.getByRole("button", { name: /Download Template/i }), 700);
    await templateDownload;
    await page.getByLabel("Select Excel file").setInputFiles(workbookFixture);
    await page.waitForTimeout(700);
    await guidedClick(page, page.getByRole("button", { name: /Import Workbook/i }), 1100);
    await page.getByText(/rows processed/i).waitFor();

    await caption(page, "Admin Workflow 3", "Upload policy PDF for AI context", "Company policy is a PDF upload. It is tracked on the company card and added to the AI context for planning and recovery.", 1700);
    await showProofPreview(page, "Proof 4", "Policy PDF preview", "Before policy upload, the video shows the policy PDF text that will be added to the company AI context.", [
      { heading: path.basename(policyFixture), lines: await parsePdfPreview(policyFixture) }
    ], 2600);
    await page.goto(`${BASE_URL}/admin`);
    await page.getByRole("heading", { name: "Application Admin" }).waitFor();
    await guidedFill(page, page.getByRole("textbox", { name: "Company name" }), "Orbitex Cloud", 500);
    await page.getByLabel("Select policy PDF").setInputFiles(policyFixture);
    await guidedClick(page, page.getByRole("button", { name: /Import Policy PDF/i }), 1000);
    await page.getByText(/policy file imported/i).waitFor();
    await spotlight(page, page.locator(".company-pipeline-card"), 1200);
    await hideSpotlight(page);

    await caption(page, "Agent Handoff", "Agent receives manager context", "After the manager uploads the workbook and policy PDF, the agent workspace receives the Orbitex request and can continue planning with the company context already applied.", 1900);
    await page.getByLabel("Role").selectOption("agent");
    await page.waitForURL("**/dashboard");
    await page.getByRole("heading", { name: "Travel Operations" }).waitFor();
    await guidedType(page, page.getByRole("textbox", { name: "Search requests" }), "Priya", 800);
    await spotlight(page, page.getByText("Priya Menon").first(), 1200);
    await hideSpotlight(page);

    await caption(page, "Done", "Complete production workflow", "The walkthrough covered form upload, pending queue, manual intake, guided flight and hotel planning, helper guidance, critical recovery, approval/export, manager workbook upload, policy PDF ingest, and the agent handoff.", 3200);

    const video = page.video();
    await context.close();
    if (video) {
      await copyFile(await video.path(), WEBM_PATH);
      console.log(`Tutorial WebM saved to ${WEBM_PATH}`);
      const mp4 = await convertToMp4();
      if (mp4) {
        console.log(`Tutorial MP4 saved to ${mp4}`);
        try {
          const audio = await generateVoiceover();
          if (audio) {
            console.log(`Tutorial voiceover saved to ${audio}`);
            const voicedVideo = await muxSyncedVoiceover(mp4, audio);
            if (voicedVideo) console.log(`Tutorial voiced MP4 saved to ${voicedVideo}`);
          } else {
            console.log("Tutorial voiceover skipped because ELEVENLABS_API_KEY is not configured.");
          }
        } catch (error) {
          console.warn(`Tutorial voiceover skipped: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } finally {
    if (browser?.isConnected()) await browser.close();
    if (server) server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
