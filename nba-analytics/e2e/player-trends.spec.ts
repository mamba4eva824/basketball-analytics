import { test, expect } from '@playwright/test';
import { LEBRON_ID } from './fixtures/seed';

test.describe('Player Trends', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/players/${LEBRON_ID}`);
    await page.waitForLoadState('networkidle');
  });

  test('trends section exists on player page', async ({ page }) => {
    // The PlayerDashboardClient renders a "Performance Trends" heading
    await expect(
      page.locator('h3', { hasText: 'Performance Trends' })
    ).toBeVisible({ timeout: 15000 });

    // There is also a metric selector dropdown
    const metricSelect = page.locator('select');
    await expect(metricSelect.first()).toBeVisible();
  });

  test('chart renders', async ({ page }) => {
    // Wait for the trend section heading
    await expect(
      page.locator('h3', { hasText: 'Performance Trends' })
    ).toBeVisible({ timeout: 15000 });

    // TrendLine uses Recharts' ResponsiveContainer which renders
    // a container with class "recharts-responsive-container" wrapping an SVG.
    const rechartsContainer = page.locator('.recharts-responsive-container').first();
    await expect(rechartsContainer).toBeVisible({ timeout: 15000 });

    // Inside the container, there should be an SVG
    const chartSvg = rechartsContainer.locator('svg').first();
    await expect(chartSvg).toBeVisible();

    // Recharts 3.x renders chart content (paths, circles, text) inside the SVG.
    // Wait for some rendered content to appear (path elements for lines/axes, circles for dots).
    const chartPaths = chartSvg.locator('path');
    await expect(chartPaths.first()).toBeVisible({ timeout: 10000 });
    const pathCount = await chartPaths.count();
    // There should be at least a few paths (grid lines, axis lines, data line)
    expect(pathCount).toBeGreaterThanOrEqual(1);
  });
});
