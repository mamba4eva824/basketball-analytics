import { test, expect } from '@playwright/test';
import { LEBRON_ID } from './fixtures/seed';

test.describe('Player Shots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/players/${LEBRON_ID}/shots`);
    await page.waitForLoadState('networkidle');
  });

  test('shot chart page loads', async ({ page }) => {
    // The shot chart page renders an h1 with "<Player> Shot Chart"
    await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Shot Chart');
  });

  test('shot chart renders SVG', async ({ page }) => {
    // ShotChart renders an SVG with viewBox="0 0 500 470" for the court
    const svg = page.locator('svg[viewBox="0 0 500 470"]');
    await expect(svg).toBeVisible({ timeout: 15000 });

    // The SVG should contain court elements (rect background, lines)
    await expect(svg.locator('rect').first()).toBeVisible();
  });

  test('shows shot data', async ({ page }) => {
    // Shot dots are rendered as <circle> elements inside the SVG
    const svg = page.locator('svg[viewBox="0 0 500 470"]');
    await expect(svg).toBeVisible({ timeout: 15000 });

    const shotDots = svg.locator('circle');
    const dotCount = await shotDots.count();
    // At minimum the court has a basket circle, plus many shot dots
    expect(dotCount).toBeGreaterThanOrEqual(2);

    // The zone breakdown table should also be visible
    await expect(page.locator('h3', { hasText: 'Zone Breakdown' })).toBeVisible();
    const zoneTable = page.locator('table');
    await expect(zoneTable.first()).toBeVisible();
    // Wait for at least one row to render in the zone table
    const zoneRows = zoneTable.first().locator('tbody tr');
    await expect(zoneRows.first()).toBeVisible({ timeout: 10000 });
    const zoneRowCount = await zoneRows.count();
    expect(zoneRowCount).toBeGreaterThanOrEqual(1);
  });
});
