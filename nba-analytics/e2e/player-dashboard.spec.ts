import { test, expect } from '@playwright/test';
import { LEBRON_ID } from './fixtures/seed';

test.describe('Player Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/players/${LEBRON_ID}`);
    await page.waitForLoadState('networkidle');
  });

  test('player dashboard loads', async ({ page }) => {
    // The page should render an h1 with the player's full name
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  });

  test('shows player name', async ({ page }) => {
    // PlayerDashboardClient renders player.fullName in the h1
    await expect(page.locator('h1')).toContainText('LeBron');
  });

  test('shows stat cards', async ({ page }) => {
    // Season stats are rendered as StatCard components with class "stat-card"
    const statCards = page.locator('.stat-card');
    await expect(statCards.first()).toBeVisible({ timeout: 15000 });
    const count = await statCards.count();
    // At minimum: PPG, RPG, APG, FG%, 3P%, FT% = 6 cards in first row
    expect(count).toBeGreaterThanOrEqual(6);

    // Verify key stat labels
    await expect(page.getByText('PPG')).toBeVisible();
    await expect(page.getByText('RPG')).toBeVisible();
    await expect(page.getByText('APG')).toBeVisible();
  });

  test('shows game log', async ({ page }) => {
    // PlayerGameLogTable renders below stats with a "Recent Games" heading
    await expect(page.locator('h3', { hasText: 'Recent Games' })).toBeVisible({ timeout: 15000 });

    // The game log table should have rows
    const table = page.locator('table').last();
    await expect(table).toBeVisible();
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });
});
