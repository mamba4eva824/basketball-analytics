import { test, expect } from '@playwright/test';

test.describe('Standings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/standings');
    await page.waitForLoadState('networkidle');
  });

  test('standings page loads', async ({ page }) => {
    // The page renders an h1 with "League Standings"
    await expect(page.locator('h1', { hasText: 'League Standings' })).toBeVisible({ timeout: 15000 });
    // Subtitle shows the season (scoped to main content to avoid matching the header)
    await expect(page.locator('main').getByText('2025-26 Regular Season')).toBeVisible();
  });

  test('shows conference tables', async ({ page }) => {
    // StandingsTable renders h3 headings: "Western Conference" and "Eastern Conference"
    // (template is `${conference}ern Conference` where conference is "West" or "East")
    await expect(
      page.locator('h3', { hasText: 'Western Conference' })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator('h3', { hasText: 'Eastern Conference' })
    ).toBeVisible();

    // Each conference has a table
    const tables = page.locator('table');
    const tableCount = await tables.count();
    expect(tableCount).toBeGreaterThanOrEqual(2);
  });

  test('shows team records', async ({ page }) => {
    // Tables have W and L column headers
    await expect(page.locator('th', { hasText: /^W$/ }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('th', { hasText: /^L$/ }).first()).toBeVisible();

    // Tables should have team rows with numeric W/L data
    const firstTable = page.locator('table').first();
    const rows = firstTable.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Each row should contain team links pointing to /teams/
    const teamLinks = firstTable.locator('tbody tr a[href^="/teams/"]');
    const linkCount = await teamLinks.count();
    expect(linkCount).toBeGreaterThanOrEqual(1);
  });
});
