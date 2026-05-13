import { test, expect } from '@playwright/test';
import { LAKERS_ID } from './fixtures/seed';

test.describe('Team Roster', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/teams/${LAKERS_ID}/roster`);
    await page.waitForLoadState('networkidle');
  });

  test('roster page loads', async ({ page }) => {
    // The roster page renders an h1 with "<Team> Roster"
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Roster');
  });

  test('roster shows players', async ({ page }) => {
    // PlayerStatsTable renders a <table> with player rows
    const table = page.locator('table');
    await expect(table.first()).toBeVisible({ timeout: 15000 });

    // Table headers include Player, Pos, GP, MPG, PPG, RPG, APG
    await expect(page.locator('th', { hasText: 'Player' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'PPG' })).toBeVisible();

    // There should be multiple player rows in the tbody
    const playerRows = table.first().locator('tbody tr');
    const rowCount = await playerRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('player names are clickable', async ({ page }) => {
    // Each player name is rendered as a Link to /players/{id}
    const playerLinks = page.locator('table tbody tr td a[href^="/players/"]');
    await expect(playerLinks.first()).toBeVisible({ timeout: 15000 });

    const count = await playerLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify the link points to a valid player page URL
    const firstHref = await playerLinks.first().getAttribute('href');
    expect(firstHref).toMatch(/^\/players\/\d+$/);
  });
});
