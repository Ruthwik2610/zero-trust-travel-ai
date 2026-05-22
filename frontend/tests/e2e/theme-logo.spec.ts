import { expect, test, type Page } from "@playwright/test";

async function mockDashboardBackend(page: Page) {
  await page.route("**/api/auth/demo-login", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "theme-token",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 900,
        user: {
          user_id: "usr_theme",
          email: "demo.agent@unipro.com",
          role: "travel_manager",
          department: "travel_ops",
          scopes: ["travel:plan", "policy:read", "admin:summary"],
          manager_scope: [],
          token_expires_at: Math.floor(Date.now() / 1000) + 900
        }
      })
    });
  });
  await page.route("**/api/corporate/requests**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
  });
}

test("dark mode themes the shell chrome and logo lockup", async ({ page }) => {
  await mockDashboardBackend(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("unipro-travel-theme", "dark");
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Agent Operations Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();

  const styles = await page.evaluate(() => {
    const shell = document.querySelector(".ops-shell");
    const sidebar = document.querySelector(".ops-sidebar");
    const brand = document.querySelector(".brand-lockup strong");
    const brandCaption = document.querySelector(".brand-lockup small");
    if (!shell || !sidebar || !brand || !brandCaption) {
      throw new Error("The app shell logo lockup did not render.");
    }
    const shellStyle = getComputedStyle(shell);
    const sidebarStyle = getComputedStyle(sidebar);
    const brandStyle = getComputedStyle(brand);
    const captionStyle = getComputedStyle(brandCaption);
    return {
      shellBackground: shellStyle.backgroundColor,
      sidebarBackground: sidebarStyle.backgroundColor,
      brandColor: brandStyle.color,
      captionColor: captionStyle.color
    };
  });

  expect(styles.shellBackground).not.toBe("rgb(255, 255, 255)");
  expect(styles.sidebarBackground).not.toBe("rgb(249, 251, 251)");
  expect(styles.brandColor).not.toBe("rgb(15, 32, 48)");
  expect(styles.captionColor).not.toBe("rgb(78, 91, 102)");
});

test("request workspace does not overflow on mobile", async ({ page }) => {
  await mockDashboardBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/requests/corp_req_mobile");
  await expect(page.getByRole("heading", { name: "Request Workspace" })).toBeVisible();

  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});
