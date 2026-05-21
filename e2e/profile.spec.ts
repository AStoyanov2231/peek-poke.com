import { test, expect } from '@playwright/test';

test('bio inline edit — shows textarea, allows typing, and saves', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit bio' }).click();
  const textarea = page.getByPlaceholder('Write something about yourself...');
  await expect(textarea).toBeVisible();
  await textarea.fill('E2E test bio');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(textarea).not.toBeVisible();
});

test('interests card is visible', async ({ page }) => {
  await page.goto('/profile');
  // ProfileInterests renders inside a Card — verify the section is present
  const interestsCard = page.getByText('Interests').first();
  await expect(interestsCard).toBeVisible();
});

test('settings sheet opens on Settings button click', async ({ page }) => {
  // Desktop viewport to expose the Settings button in the identity row
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('share sheet opens on Share button click', async ({ page }) => {
  await page.goto('/profile');
  // Mobile: "Share profile" full-width button; Desktop: "Share" button
  await page.getByRole('button', { name: /share/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

// Known bug: pencil button next to username has empty onClick — no navigation occurs.
// src/components/profile/ProfilePageClient.tsx:300 — onClick={() => { /* navigate to edit */ }}
test.fixme('"Edit profile" pencil next to username navigates to an edit page', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit profile' }).first().click();
  await expect(page).not.toHaveURL('/profile');
});
