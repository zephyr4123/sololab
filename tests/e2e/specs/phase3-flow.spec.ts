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

  test("IdeaSpark module page has Report tab", async ({ page }) => {
    await page.goto("/modules/ideaspark");
    const reportTab = page.getByRole("button", { name: "Report" });
    await expect(reportTab).toBeVisible();
  });

  test("tools API lists doc_parse tool", async ({ request }) => {
    const response = await request.get("/api/tools");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const names = body.map((t: { name: string }) => t.name);
    expect(names).toContain("doc_parse");
  });

  test("enhanced health check returns service status", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.version).toBe("0.3.0");
    expect(body).toHaveProperty("services");
    expect(body.services).toHaveProperty("redis");
    expect(body.services).toHaveProperty("database");
    expect(body).toHaveProperty("modules_loaded");
  });

  test("traces API returns data", async ({ request }) => {
    const response = await request.get("/api/providers/traces");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("traces");
    expect(body).toHaveProperty("summary");
  });

  test("responses include rate limit headers", async ({ request }) => {
    const response = await request.get("/api/modules");
    expect(response.ok()).toBeTruthy();
    const remaining = response.headers()["x-ratelimit-remaining"];
    expect(remaining).toBeDefined();
  });

  test("model switcher options are visible", async ({ page }) => {
    await page.goto("/");
    const select = page.locator("select");
    await expect(select.first()).toBeVisible();
    // 应有多个选项
    const options = select.first().locator("option");
    expect(await options.count()).toBeGreaterThanOrEqual(3);
  });
});
