import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('displays SoloLab title and module cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'SoloLab' })).toBeVisible();
    // 主内容区的模块卡片（通过 heading 定位避免侧边栏重复）
    await expect(page.getByRole('heading', { name: 'IdeaSpark' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CodeLab' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'WriterAI' })).toBeVisible();
  });

  test('sidebar shows module navigation', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('SoloLab')).toBeVisible();
  });

  test('topbar shows provider selector', async ({ page }) => {
    await page.goto('/');
    const select = page.locator('select');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('openai/gpt-4o');
  });
});

test.describe('Module Navigation', () => {
  test('navigate to IdeaSpark module page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /IdeaSpark/ }).first().click();
    await page.waitForURL(/\/modules\/ideaspark/);
    expect(page.url()).toContain('/modules/ideaspark');
  });
});
