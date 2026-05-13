import { test, expect } from '@playwright/test';
import { LAKERS_ID } from './fixtures/seed';

test.describe('Team Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/teams/${LAKERS_ID}`);
    await page.waitForLoadState('networkidle');
  });

  test('team dashboard loads', async ({ page }) => {
    // The page should have rendered (not stuck on loading skeleton)
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });

  test('shows team name', async ({ page }) => {
    // TeamDashboardClient renders team.fullName in an h1
    await expect(page.locator('h1')).toContainText('Lakers');
  });

  test('shows stat cards', async ({ page }) => {
    // The dashboard renders StatCard components with class "stat-card"
    // Core stats include Offensive Rating, Defensive Rating, Net Rating, Pace
    const statCards = page.locator('.stat-card');
    await expect(statCards.first()).toBeVisible({ timeout: 15000 });
    const count = await statCards.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Verify specific stat labels are present within stat cards
    await expect(page.locator('.stat-card', { hasText: 'Offensive Rating' }).first()).toBeVisible();
    await expect(page.locator('.stat-card', { hasText: 'Defensive Rating' }).first()).toBeVisible();
    await expect(page.locator('.stat-card', { hasText: 'Net Rating' }).first()).toBeVisible();
    await expect(page.locator('.stat-card', { hasText: 'Pace' }).first()).toBeVisible();
  });

  test('displays per-game team stats', async ({ page }) => {
    // Wait for stat cards to render
    await expect(page.locator('.stat-card').first()).toBeVisible({ timeout: 15000 });

    // Verify the 8 per-game stat labels are visible
    await expect(page.getByText('FG%', { exact: true })).toBeVisible();
    await expect(page.getByText('3P%', { exact: true })).toBeVisible();
    await expect(page.getByText('FT%', { exact: true })).toBeVisible();
    await expect(page.getByText('RPG', { exact: true })).toBeVisible();
    await expect(page.getByText('APG', { exact: true })).toBeVisible();
    await expect(page.getByText('SPG', { exact: true })).toBeVisible();
    await expect(page.getByText('BPG', { exact: true })).toBeVisible();
    await expect(page.getByText('TOPG', { exact: true })).toBeVisible();
  });

  test('shows roster link', async ({ page }) => {
    // The team header has a "Roster" link
    const rosterLink = page.locator(`a[href="/teams/${LAKERS_ID}/roster"]`);
    await expect(rosterLink.first()).toBeVisible();
    await expect(rosterLink.first()).toHaveText('Roster');
  });
});
