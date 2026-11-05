import { test, expect } from '@playwright/test';

// Runs against scripts/seed-test-data.ts (season 2025-26): LeBron + AD shared 20 minutes.
test.describe('Lineup Lab', () => {
  test('nav link opens the lab and tapping players builds a comparison', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/lineups"]').first().click();
    await page.waitForURL('**/lineups');
    await expect(page.getByRole('heading', { name: 'Build a combination' })).toBeVisible({ timeout: 15000 });

    await page.locator('div[role="button"]', { hasText: 'LeBron James' }).click();
    await page.locator('div[role="button"]', { hasText: 'Anthony Davis' }).click();
    await expect(page).toHaveURL(/on=2544%2C203076|on=2544,203076/);

    const zone = page.getByLabel('On the floor together', { exact: true });
    await expect(zone.getByText('LeBron James')).toBeVisible();
    // desktop viewport: the results table (phones get cards instead)
    const table = page.getByRole('table');
    await expect(table.getByText('James + Davis', { exact: true })).toBeVisible();
    await expect(table.getByText('James, no Davis', { exact: true })).toBeVisible();
    await expect(table.getByText('Never on the floor in this combination this season.')).toBeVisible();
  });

  test('a drag onto "Off the floor" works too', async ({ page }) => {
    await page.goto('/lineups?on=2544');
    const card = page.locator('div[role="button"]', { hasText: 'Anthony Davis' });
    const zone = page.getByLabel('Off the floor', { exact: true });
    const a = (await card.boundingBox())!;
    const z = (await zone.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 15, a.y + a.height / 2 + 15, { steps: 5 });
    await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(page).toHaveURL(/off=203076/);
    await expect(page.getByRole('table').getByText('James, no Davis', { exact: true })).toBeVisible();
  });
});
