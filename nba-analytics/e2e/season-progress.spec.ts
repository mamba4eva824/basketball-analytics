import { test, expect } from '@playwright/test';

// Runs against scripts/seed-test-data.ts (season 2025-26).
test.describe('Season progress', () => {
  test('nav link opens the page with the five default focus areas', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/progress"]').first().click();
    await page.waitForURL('**/progress');
    await expect(page.getByRole('heading', { name: 'Season progress' })).toBeVisible({ timeout: 15000 });
    const focus = page.locator('section', { has: page.getByRole('heading', { name: 'Focus areas' }) });
    for (const label of ['Turnover %', 'Off. Rebound %', 'Opp Off. Reb %', 'Defensive Rating', 'Net Rating']) {
      await expect(focus.locator('.stat-card', { hasText: label })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'League rank, game by game' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Season splits' })).toBeVisible();
  });

  test('pinning a metric adds it to the dashboard scorecard too, and reset restores the defaults', async ({ page }) => {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Season progress' })).toBeVisible({ timeout: 15000 });
    await page.getByLabel('Pin a metric').selectOption('oppEfgPct');
    const focus = page.locator('section', { has: page.getByRole('heading', { name: 'Focus areas' }) });
    await expect(focus.locator('.stat-card')).toHaveCount(6);
    await page.goto('/');
    const dash = page.locator('section', { has: page.getByRole('heading', { name: 'Focus areas' }) });
    await expect(dash.locator('.stat-card', { hasText: 'Opp eFG%' })).toBeVisible({ timeout: 15000 });
    await page.goto('/progress');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(focus.locator('.stat-card')).toHaveCount(5);
  });
});
