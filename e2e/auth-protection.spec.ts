import { test, expect } from '@playwright/test';

// These tests run in the unauthenticated Playwright project (no storageState).
// Middleware should redirect every protected route to /login.

const protectedRoutes = ['/', '/inbox', '/profile', '/admin'];

for (const route of protectedRoutes) {
  test(`${route} redirects unauthenticated users to /login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  });
}

test('/login page is publicly accessible', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL('/login');
  await expect(page.getByPlaceholder('Email')).toBeVisible();
});
