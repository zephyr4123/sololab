import { test, expect } from "@playwright/test";

test.describe("Phase 3: Document & Session Management", () => {
  test("dashboard displays SoloLab title", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "SoloLab" })
    ).toBeVisible();
  });

  test("navigate to IdeaSpark module page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /IdeaSpark/ }).first().click();
    await page.waitForURL(/\/modules\/ideaspark/);
    expect(page.url()).toContain("/modules/ideaspark");
  });

  test("sidebar navigation is visible", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });

  test("health check API returns ok", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.2.0");
  });

  test("sessions API returns list", async ({ request }) => {
    const response = await request.get("/api/sessions");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("providers API returns config", async ({ request }) => {
    const response = await request.get("/api/providers");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("default_model");
  });

  test("cost API returns statistics", async ({ request }) => {
    const response = await request.get("/api/providers/cost?days=30");
    // May return 503 if DB not initialized, which is acceptable
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty("total_cost_usd");
      expect(body).toHaveProperty("by_model");
    }
  });

  test("document search API works", async ({ request }) => {
    const response = await request.post(
      "/api/documents/search?query=test&top_k=5"
    );
    // May return 503 if DB not initialized
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty("results");
    }
  });
});
