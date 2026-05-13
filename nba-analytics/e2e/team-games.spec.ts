import { test, expect } from '@playwright/test';
import { LAKERS_ID } from './fixtures/seed';

test.describe('Team Games', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/teams/${LAKERS_ID}/games`);
    await page.waitForLoadState('networkidle');
  });

  test('games page loads', async ({ page }) => {
    // The games page renders an h1 with "<Team> Game Log"
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Game Log');
  });

  test('shows game entries', async ({ page }) => {
    // TeamGameLogTable renders a <table> with game rows
    const table = page.locator('table');
    await expect(table.first()).toBeVisible({ timeout: 15000 });

    // Table headers include Date, Opponent, Result, PTS, OPP, etc.
    await expect(page.locator('th', { hasText: 'Date' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Result' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'PTS' })).toBeVisible();

    // There should be game rows in the tbody
    const gameRows = table.first().locator('tbody tr');
    const rowCount = await gameRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Each game row should have a W or L result badge
    const resultBadges = page.locator('table tbody tr span', { hasText: /^[WL]$/ });
    const badgeCount = await resultBadges.count();
    expect(badgeCount).toBeGreaterThanOrEqual(1);
  });
});
