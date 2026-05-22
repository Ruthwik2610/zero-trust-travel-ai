import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const shouldStartServer = !process.env.LIGHTHOUSE_BASE_URL;
const serverPort = Number(process.env.LIGHTHOUSE_PORT || 3201);
const baseUrl = process.env.LIGHTHOUSE_BASE_URL || `http://127.0.0.1:${serverPort}`;
const outputDir = process.env.LIGHTHOUSE_OUTPUT_DIR || path.join(process.cwd(), "lighthouse-report");
const routes = (process.env.LIGHTHOUSE_ROUTES || "/,/dashboard,/admin,/travelers,/policy")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);

const thresholds = {
  performance: Number(process.env.LIGHTHOUSE_MIN_PERFORMANCE || 0.45),
  accessibility: Number(process.env.LIGHTHOUSE_MIN_ACCESSIBILITY || 0.9),
  "best-practices": Number(process.env.LIGHTHOUSE_MIN_BEST_PRACTICES || 0.8),
  seo: Number(process.env.LIGHTHOUSE_MIN_SEO || 0.8)
};

function slugFor(route) {
  if (route === "/") return "root";
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function urlFor(route) {
  return new URL(route, baseUrl).toString();
}

async function waitForServer(url, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

await fs.mkdir(outputDir, { recursive: true });

let server;
if (shouldStartServer) {
  server = spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(serverPort)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TRAVEL_AI_API_INTERNAL_URL: process.env.TRAVEL_AI_API_INTERNAL_URL || "http://127.0.0.1:8100" }
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  await waitForServer(baseUrl);
}

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"]
});

const failures = [];
try {
  for (const route of routes) {
    const url = urlFor(route);
    const result = await lighthouse(url, {
      port: chrome.port,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: Object.keys(thresholds),
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"]
    });

    if (!result) {
      failures.push(`${route}: Lighthouse did not return a result`);
      continue;
    }

    const slug = slugFor(route);
    const [jsonReport, htmlReport] = Array.isArray(result.report) ? result.report : [result.report, ""];
    await fs.writeFile(path.join(outputDir, `${slug}.json`), jsonReport);
    await fs.writeFile(path.join(outputDir, `${slug}.html`), htmlReport);

    const scores = Object.fromEntries(
      Object.entries(result.lhr.categories).map(([category, value]) => [category, value.score ?? 0])
    );
    console.log(`${route} ${Object.entries(scores).map(([key, value]) => `${key}=${Math.round(value * 100)}`).join(" ")}`);

    for (const [category, minimum] of Object.entries(thresholds)) {
      const score = scores[category] ?? 0;
      if (score < minimum) {
        failures.push(`${route}: ${category} ${Math.round(score * 100)} below ${Math.round(minimum * 100)}`);
      }
    }
  }
} finally {
  await chrome.kill();
  if (server) {
    server.kill("SIGTERM");
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
