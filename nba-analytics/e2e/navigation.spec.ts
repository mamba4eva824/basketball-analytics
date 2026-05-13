import { test, expect } from '@playwright/test';
import { LAKERS_ID } from './fixtures/seed';

test.describe('Navigation', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The home page renders "NBA Analytics Dashboard" as the hero heading
    await expect(page.locator('h1', { hasText: 'NBA Analytics Dashboard' })).toBeVisible();
    // The "Select a Team" section should be present
    await expect(page.locator('h2', { hasText: 'Select a Team' })).toBeVisible();
  });

  test('can navigate to team dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The page has links to the Lakers (sidebar quick links + team grid)
    const lakersLink = page.locator(`a[href="/teams/${LAKERS_ID}"]`).first();
    await expect(lakersLink).toBeVisible();
    await lakersLink.click();

    await page.waitForURL(`**/teams/${LAKERS_ID}`, { timeout: 15000 });
    expect(page.url()).toContain(`/teams/${LAKERS_ID}`);
  });

  test('can navigate to standings', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The hero section has a "View Standings" link
    const standingsLink = page.locator('a[href="/standings"]').first();
    await expect(standingsLink).toBeVisible();
    await standingsLink.click();

    await page.waitForURL('**/standings', { timeout: 15000 });
    expect(page.url()).toContain('/standings');
    await expect(page.locator('h1', { hasText: 'League Standings' })).toBeVisible();
  });
});
