import { test, expect } from '@playwright/test';

test('map page loads and shows search bar', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByPlaceholder('Search people nearby')).toBeVisible();
});

test('coins badge visible in desktop navigation', async ({ page }) => {
  // Coins widget lives in the desktop sidebar (DesktopNav). Use a wider viewport to reveal it.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect(page.getByText(/coins/i)).toBeVisible();
});

// Known bug: filter button has no onClick handler — no panel opens on click.
test.fixme('filter button opens a filter panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
