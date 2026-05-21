import { test, expect } from '@playwright/test';

test.describe('login flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('valid credentials redirect to map page', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill('test2@test.com');
    await page.getByPlaceholder('Password').fill('1qaz1qaz');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/');
  });

  test('wrong credentials show error alert', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill('test2@test.com');
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('logout', () => {
  test('sign out redirects to login page', async ({ page }) => {
    await page.goto('/profile');
    // Desktop: "Settings" button in identity row. Mobile: settings via ProfileCover gear icon.
    // Try desktop button first; fall back to any button containing "Settings".
    const settingsBtn = page.getByRole('button', { name: 'Settings' }).first();
    await settingsBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
