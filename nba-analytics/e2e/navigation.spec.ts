import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('home page loads the Lakers dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1', { hasText: 'Los Angeles Lakers' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'New-look roster' })).toBeVisible();
  });

  test('can navigate to the matchup page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const matchupLink = page.locator('a[href="/matchup"]').first();
    await expect(matchupLink).toBeVisible();
    await matchupLink.click();

    await page.waitForURL('**/matchup', { timeout: 15000 });
    await expect(page.getByText('Opponent scouting')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Tale of the tape' })).toBeVisible();
  });

  test('theme control switches between light and dark', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
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
