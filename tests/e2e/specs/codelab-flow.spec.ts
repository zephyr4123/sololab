import { test, expect } from '@playwright/test';

test.describe('CodeLab Module', () => {
  test('CodeLab card visible on dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'CodeLab' })).toBeVisible();
  });

  test('navigate to CodeLab module page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /CodeLab/ }).first().click();
    await page.waitForURL(/\/modules\/codelab/);
    expect(page.url()).toContain('/modules/codelab');
  });

  test('CodeLab module loaded via API', async ({ request }) => {
    const response = await request.get(
      `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/modules`
    );
    expect(response.ok()).toBeTruthy();
    const modules = await response.json();
    const codelab = modules.find((m: { id: string }) => m.id === 'codelab');
    expect(codelab).toBeTruthy();
    expect(codelab.name).toBe('CodeLab');
    expect(codelab.version).toBe('0.1.0');
  });

  test('CodeLab health API returns response', async ({ request }) => {
    const response = await request.get(
      `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/modules/codelab/health`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('ok');
  });

  test('CodeLab config API returns schema', async ({ request }) => {
    const response = await request.get(
      `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/modules/codelab/config`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.id).toBe('codelab');
    expect(data.config_schema).toBeTruthy();
    expect(data.config_schema.properties).toHaveProperty('opencode_url');
  });
});
