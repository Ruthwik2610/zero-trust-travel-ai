import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { access, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ASSETS_DIR = path.resolve(process.cwd(), "../../marketing/assets");
const VIDEO_DIR = path.join(ASSETS_DIR, "videos");
const VIDEO_PATH = path.join(VIDEO_DIR, "unipro-travel-ai-workflow.webm");
const MP4_PATH = path.join(VIDEO_DIR, "unipro-travel-ai-workflow.mp4");
const DOWNLOAD_PATH = path.join(ASSETS_DIR, "walkthrough-trip_e2e-itinerary.pdf");
const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/Applications/Kap.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg",
  "/Applications/Elmedia Player.app/Contents/Resources/ffmpeg",
  "/Applications/Stremio.app/Contents/MacOS/ffmpeg"
].filter(Boolean);

const travelerAuth = {
  user_id: "usr_demo",
  email: "demo.user@unipro.com",
  role: "traveler",
  department: "sales",
  scopes: ["travel:plan", "self:trips"],
  manager_scope: [],
  token_expires_at: Math.floor(Date.now() / 1000) + 900
};

const adminAuth = {
  user_id: "usr_admin",
  email: "admin.user@unipro.com",
  role: "travel_manager",
  department: "travel_ops",
  scopes: ["admin:summary", "admin:audit"],
  manager_scope: ["sales"],
  token_expires_at: Math.floor(Date.now() / 1000) + 900
};

const sampleTrip = {
  id: "trip_e2e",
  request: {
    origin: "Hyderabad",
    destination: "Johannesburg",
    depart_date: "2026-06-10",
    return_date: "2026-06-17",
    travelers: 1,
    cabin: "economy",
    budget_usd: 1200,
    purpose: "Client meetings"
  },
  status: "draft",
  risk: "medium",
  flight_offers: [{
    id: "flight_e2e",
    kind: "flight",
    title: "Hyderabad to Johannesburg",
    provider: "shared-unipro-planner",
    price_usd: 420,
    currency: "USD",
    refundable: true,
    notes: ["Depart 2026-06-10 22:15", "Arrive 2026-06-11 18:55", "1 stop"]
  }],
  hotel_offers: [{
    id: "hotel_e2e",
    kind: "hotel",
    title: "Business-ready stay near Johannesburg",
    provider: "shared-unipro-planner",
    price_usd: 1120,
    currency: "USD",
    refundable: true,
    notes: ["4 star business hotel", "Includes Wi-Fi."]
  }],
  itinerary: [
    { day: 1, title: "Arrival", details: "Arrive and check in." },
    { day: 2, title: "Meetings", details: "Client meetings." }
  ],
  policy_checks: ["Risk level: medium."],
  savings_suggestions: ["Compare nearby airports."],
  created_at: "2026-05-18T08:00:00.000Z"
};

function startServer() {
  const server = spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[walkthrough-server] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[walkthrough-server] ${chunk}`));
  return server;
}

async function findFfmpeg() {
  for (const candidate of FFMPEG_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking through common local install locations.
    }
  }
  throw new Error("ffmpeg was not found. Install it with `brew install ffmpeg` or set FFMPEG_PATH.");
}

async function runProcess(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => process.stdout.write(`[ffmpeg] ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`[ffmpeg] ${chunk}`));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function convertVideoToMp4() {
  const ffmpeg = await findFfmpeg();
  await runProcess(ffmpeg, [
    "-y",
    "-i", VIDEO_PATH,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
    MP4_PATH
  ]);
  return MP4_PATH;
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

async function mockTravelBackend(page) {
  await page.route("**/api/auth/demo-login", async (route) => {
    const body = route.request().postDataJSON?.();
    const email = body?.email || travelerAuth.email;
    await route.fulfill({
      json: {
        access_token: "walkthrough-token",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 900,
        user: email.includes("admin") ? { ...adminAuth, email } : { ...travelerAuth, email }
      }
    });
  });
  await page.route("**/api/trips", async (route) => {
    await route.fulfill({
      status: route.request().method() === "POST" ? 201 : 200,
      json: route.request().method() === "POST" ? sampleTrip : [sampleTrip]
    });
  });
  await page.route("**/api/agent/plan", async (route) => {
    await route.fulfill({
      json: {
        risk: "medium",
        user_message: "Draft plan prepared from shared Unipro backend policy and pricing estimates.",
        audit_events: [],
        trip: sampleTrip
      }
    });
  });
  await page.route("**/api/agent/chat", async (route) => {
    await route.fulfill({
      json: {
        message: "The approval packet, policy summary, and traveler context are ready.",
        model: "walkthrough-model",
        audit_events: []
      }
    });
  });
  await page.route("**/api/tools/currency-conversion", async (route) => {
    await route.fulfill({
      json: {
        amount: 153846,
        currency: "INR",
        rate: 83.2,
        display: "₹153,846",
        source: "mcp"
      }
    });
  });
  await page.route("**/api/admin/summary", async (route) => {
    await route.fulfill({
      json: {
        total_trips: 42,
        draft_trips: 11,
        booked_trips: 24,
        high_risk_trips: 3,
        audit_events: 128
      }
    });
  });
  await page.route("**/api/admin/audit", async (route) => {
    await route.fulfill({
      json: [
        {
          id: "audit_walkthrough_1",
          trip_id: "trip_e2e",
          event_type: "plan.created",
          message: "Traveler created a policy-aware travel plan.",
          created_at: "2026-05-18T08:00:00.000Z"
        },
        {
          id: "audit_walkthrough_2",
          trip_id: "trip_e2e",
          event_type: "trip.saved",
          message: "Trip draft saved for manager review.",
          created_at: "2026-05-18T08:05:00.000Z"
        }
      ]
    });
  });
}

async function installAuth(page, auth) {
  await page.evaluate((context) => {
    window.localStorage.setItem("travel_ai_api_token", "walkthrough-token");
    window.localStorage.setItem("travel_ai_auth_context", JSON.stringify(context));
    window.localStorage.setItem("travel_ai_user_email", context.email);
  }, auth);
}

async function pause(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

async function ensureWalkthroughOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById("walkthrough-overlay-root")) return;

    const style = document.createElement("style");
    style.id = "walkthrough-overlay-style";
    style.textContent = `
      @keyframes walkthroughSlideUp {
        from { opacity: 0; transform: translateY(18px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes walkthroughPulse {
        0% { box-shadow: 0 0 0 0 rgba(43, 108, 246, 0.38); }
        70% { box-shadow: 0 0 0 18px rgba(43, 108, 246, 0); }
        100% { box-shadow: 0 0 0 0 rgba(43, 108, 246, 0); }
      }

      @keyframes walkthroughShimmer {
        from { transform: translateX(-100%); }
        to { transform: translateX(100%); }
      }

      .walkthrough-narration {
        position: fixed;
        left: 32px;
        bottom: 28px;
        z-index: 2147483000;
        width: min(520px, calc(100vw - 64px));
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.26);
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(10, 24, 49, 0.96), rgba(24, 46, 86, 0.92));
        color: #ffffff;
        box-shadow: 0 24px 70px rgba(8, 15, 31, 0.34);
        padding: 18px 20px 18px 22px;
        animation: walkthroughSlideUp 420ms ease both;
        pointer-events: none;
      }

      .walkthrough-narration::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent);
        animation: walkthroughShimmer 2.6s ease-in-out infinite;
      }

      .walkthrough-narration span,
      .walkthrough-narration strong,
      .walkthrough-narration p {
        position: relative;
        z-index: 1;
      }

      .walkthrough-narration span {
        display: block;
        margin-bottom: 7px;
        color: #9cc5ff;
        font-size: 0.74rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .walkthrough-narration strong {
        display: block;
        font-size: 1.18rem;
        line-height: 1.15;
      }

      .walkthrough-narration p {
        margin: 8px 0 0;
        color: rgba(255, 255, 255, 0.82);
        font-size: 0.92rem;
        line-height: 1.42;
      }

      .walkthrough-spotlight {
        position: fixed;
        z-index: 2147482999;
        border: 3px solid #2b6cf6;
        border-radius: 12px;
        background: rgba(43, 108, 246, 0.10);
        animation: walkthroughPulse 1.25s ease-out infinite;
        pointer-events: none;
        transition: opacity 180ms ease;
      }

      .walkthrough-click-label {
        position: fixed;
        z-index: 2147483001;
        border-radius: 999px;
        background: #2b6cf6;
        color: #ffffff;
        box-shadow: 0 12px 32px rgba(43, 108, 246, 0.32);
        padding: 8px 12px;
        font-size: 0.78rem;
        font-weight: 900;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "walkthrough-overlay-root";
    root.innerHTML = `
      <section class="walkthrough-narration" aria-hidden="true">
        <span></span>
        <strong></strong>
        <p></p>
      </section>
      <div class="walkthrough-spotlight" aria-hidden="true" style="opacity:0"></div>
      <div class="walkthrough-click-label" aria-hidden="true" style="opacity:0"></div>
    `;
    document.body.appendChild(root);
  });
}

async function showNarration(page, step, title, body, pauseAfter = 850) {
  await ensureWalkthroughOverlay(page);
  await page.evaluate(({ step, title, body }) => {
    const card = document.querySelector(".walkthrough-narration");
    if (!card) return;
    card.querySelector("span").textContent = step;
    card.querySelector("strong").textContent = title;
    card.querySelector("p").textContent = body;
    card.style.animation = "none";
    void card.offsetHeight;
    card.style.animation = "";
  }, { step, title, body });
  await pause(page, pauseAfter);
}

async function showClickCue(locator, page, label = "Click here") {
  await ensureWalkthroughOverlay(page);
  const box = await locator.boundingBox();
  if (!box) return;
  await page.evaluate(({ box, label }) => {
    const spotlight = document.querySelector(".walkthrough-spotlight");
    const clickLabel = document.querySelector(".walkthrough-click-label");
    if (!spotlight || !clickLabel) return;

    const pad = 8;
    spotlight.style.opacity = "1";
    spotlight.style.left = `${Math.max(8, box.x - pad)}px`;
    spotlight.style.top = `${Math.max(8, box.y - pad)}px`;
    spotlight.style.width = `${box.width + pad * 2}px`;
    spotlight.style.height = `${box.height + pad * 2}px`;

    clickLabel.textContent = label;
    clickLabel.style.opacity = "1";
    clickLabel.style.left = `${Math.min(window.innerWidth - 180, box.x + box.width + 12)}px`;
    clickLabel.style.top = `${Math.max(16, box.y + box.height / 2 - 18)}px`;
  }, { box, label });
}

async function hideClickCue(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".walkthrough-spotlight, .walkthrough-click-label").forEach((node) => {
      node.style.opacity = "0";
    });
  }).catch(() => undefined);
}

async function humanClick(locator, page, pauseBefore = 350, pauseAfter = 900, label = "Click") {
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await showClickCue(locator, page, label);
  await pause(page, pauseBefore);
  await locator.click();
  await hideClickCue(page);
  await pause(page, pauseAfter);
}

async function humanType(locator, text, page, delay = 45) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await pause(page, 180);
  await locator.pressSequentially(text, { delay });
  await pause(page, 700);
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
    await mockTravelBackend(page);

    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");
    await showNarration(
      page,
      "Step 1 - Login",
      "Start on the secure sign-in page",
      "The traveler signs in before accessing saved trips, planning tools, and itinerary downloads.",
      1600
    );

    await humanType(page.getByLabel("Email address"), "demo.user@unipro.com", page, 55);
    await humanType(page.getByLabel("Password"), "travel-demo-2026", page, 70);
    await humanClick(page.getByRole("button", { name: /^sign in$/i }), page, 500, 1200, "Sign in");
    await page.getByText("Travel summary").waitFor();
    await showNarration(
      page,
      "Step 2 - Traveler dashboard",
      "Review trips before planning",
      "The dashboard summarizes saved trips, upcoming travel, spend, and risk before the traveler creates a new request.",
      1600
    );

    await humanClick(page.getByRole("link", { name: /plan a new trip/i }), page, 600, 1200, "Plan a new trip");
    await page.getByText("Business Trip Planner").waitFor();
    await showNarration(
      page,
      "Step 3 - Describe the trip",
      "Type one business request",
      "The assistant parses route, dates, purpose, and a hotel-near-office filter from plain language.",
      1400
    );

    await humanType(
      page.getByLabel("Travel request"),
      "Plan Hyderabad to Johannesburg from 2026-06-10 to 2026-06-17 for client meetings and a hotel near my office",
      page,
      42
    );
    await humanClick(page.getByRole("button", { name: /find flights/i }), page, 550, 1300, "Find flights");
    await page.getByRole("button", { name: /choose hotel/i }).waitFor();
    await showNarration(
      page,
      "Step 4 - Compare flights",
      "Choose a policy-aware flight",
      "The workflow shows fares, timing, and policy status so the traveler can pick without leaving the planner.",
      1500
    );

    await humanClick(page.getByRole("button", { name: /qatar airways/i }), page, 500, 900, "Select flight");
    await humanClick(page.getByRole("button", { name: /choose hotel/i }), page, 500, 1300, "Choose hotel");
    await page.getByText("Business-ready stay near Johannesburg").first().waitFor();
    await showNarration(
      page,
      "Step 5 - Apply hotel filter",
      "Find hotels near the office",
      "The assistant applies a practical filter and selects the closest policy-ready stay.",
      1500
    );

    await humanClick(page.getByRole("button", { name: /hotels near office/i }), page, 500, 1500, "Apply filter");
    await page.getByText("Office-near hotel applied").waitFor();
    await showNarration(
      page,
      "Filter applied",
      "Closest compliant hotel selected",
      "The selected stay is 0.8km from the office and remains within the policy path.",
      1300
    );
    await humanClick(page.getByRole("button", { name: /review approval/i }), page, 500, 1300, "Review approval");
    await page.getByRole("button", { name: /download itinerary/i }).waitFor();
    await showNarration(
      page,
      "Step 6 - Approval packet",
      "Prepare manager context",
      "The approval screen brings together flight, hotel, budget, manager, cost center, and justification.",
      1500
    );

    await humanClick(page.getByLabel("Display currency"), page, 420, 700, "Currency");
    await page.getByLabel("Display currency").selectOption("INR");
    await page.getByText("INR view for review").waitFor();
    await showNarration(
      page,
      "Currency converted",
      "Review in local currency",
      "The traveler can switch the estimate for stakeholder review while keeping the itinerary consistent.",
      1300
    );

    await humanClick(page.getByRole("button", { name: /draft manager note/i }), page, 550, 1200, "Draft note");

    await humanType(
      page.getByLabel("Justification for manager"),
      "Customer-facing meetings and onboarding workshops.",
      page,
      48
    );
    await humanClick(page.getByRole("button", { name: /save draft/i }), page, 550, 1100, "Save draft");

    const downloadPromise = page.waitForEvent("download");
    await showNarration(
      page,
      "Step 7 - Download itinerary",
      "Save and export the trip",
      "The traveler downloads a consistent itinerary package for sharing and finance review.",
      1000
    );
    await humanClick(page.getByRole("button", { name: /download itinerary/i }), page, 650, 900, "Download");
    const download = await downloadPromise;
    await download.saveAs(DOWNLOAD_PATH);
    await pause(page, 1400);

    await installAuth(page, adminAuth);
    await page.goto(`${BASE_URL}/admin`);
    await page.getByText("Users & Travelers Overview").waitFor();
    await showNarration(
      page,
      "Step 8 - Admin dashboard",
      "Managers review the travel program",
      "Admin users can see travelers, approvals, spend signals, reports, and audit activity.",
      1800
    );
    await humanClick(page.getByRole("link", { name: /reports/i }).first(), page, 450, 1100, "Open reports");
    await humanClick(page.getByRole("link", { name: /audit logs/i }).first(), page, 450, 1500, "Audit logs");

    const video = page.video();
    await context.close();
    if (video) {
      await copyFile(await video.path(), VIDEO_PATH);
      console.log(`Walkthrough video saved to ${VIDEO_PATH}`);
      const mp4Path = await convertVideoToMp4();
      console.log(`Walkthrough MP4 saved to ${mp4Path}`);
    }
    console.log(`Downloaded itinerary saved to ${DOWNLOAD_PATH}`);
  } finally {
    if (browser?.isConnected()) await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
