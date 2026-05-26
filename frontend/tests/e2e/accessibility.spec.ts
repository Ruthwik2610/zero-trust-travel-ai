import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/dashboard",
  "/requests/corp_req_e2e",
  "/itineraries/corp_req_e2e",
  "/travelers",
  "/policy",
  "/policy/activity",
  "/admin"
];

test.describe("accessibility smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/demo-login", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "a11y-token",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 900,
          user: {
            user_id: "usr_a11y",
            email: "demo.agent@unipro.com",
            role: "travel_manager",
            department: "travel_ops",
            scopes: ["admin:summary", "travel:plan", "policy:read"],
            manager_scope: [],
            token_expires_at: Math.floor(Date.now() / 1000) + 900
          }
        })
      });
    });
    await page.route("**/api/corporate/requests**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/travelers**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/policies**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/corporate/admin/summary", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          total_requests: 0,
          by_status: {},
          approval_required: 0,
          finalized: 0,
          visa_issues: 0,
          average_handling_time_hours: 0,
          common_destinations: []
        })
      });
    });
    await page.route("**/api/admin/audit", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
  });

  for (const route of routes) {
    test(`${route} has no automatically detectable WCAG A/AA violations`, async ({ page }) => {
      if (route !== "/") {
        await page.goto("/");
        await page.getByRole("button", { name: /Continue to workspace/i }).click();
        await page.waitForURL("**/dashboard");
      }

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
