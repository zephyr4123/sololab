import { test, expect } from '@playwright/test';

test.describe('Module Flow', () => {
  test('dashboard shows available modules', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('SoloLab')).toBeVisible();
    await expect(page.getByText('IdeaSpark')).toBeVisible();
  });

  test('navigate to IdeaSpark module', async ({ page }) => {
    await page.goto('/modules/ideaspark');
    await expect(page.getByPlaceholder(/research topic/i)).toBeVisible();
  });

  test('IdeaSpark chat input works', async ({ page }) => {
    await page.goto('/modules/ideaspark');
    const input = page.getByPlaceholder(/research topic/i);
    await input.fill('Multi-agent systems in drug discovery');
    // TODO: Verify send button becomes enabled
  });
});
