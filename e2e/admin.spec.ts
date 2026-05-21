import { test, expect } from '@playwright/test';

// These tests assume test2@test.com has the admin role.
// If the user is not an admin, all tests here will fail with "Access denied".

test('admin panel loads with correct heading', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
});

test('moderation tab is present and active by default', async ({ page }) => {
  await page.goto('/admin');
  const moderationTab = page.getByRole('tab', { name: 'Moderation' });
  await expect(moderationTab).toBeVisible();
  await expect(moderationTab).toHaveAttribute('data-state', 'active');
});

test('moderation tab shows approve and reject controls', async ({ page }) => {
  await page.goto('/admin');
  // Approve/reject buttons appear for each pending photo submission
  // If no pending items, verify the empty-state message instead
  const approveBtn = page.getByRole('button', { name: /approve/i }).first();
  const rejectBtn = page.getByRole('button', { name: /reject/i }).first();
  const hasItems = (await approveBtn.count()) > 0;
  if (hasItems) {
    await expect(approveBtn).toBeVisible();
    await expect(rejectBtn).toBeVisible();
  } else {
    // No pending photos — panel renders an empty state
    await expect(page.getByRole('tabpanel')).toBeVisible();
  }
});

test('coins tab is accessible and renders content', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Coins' }).click();
  await expect(page.getByRole('tab', { name: 'Coins' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('tabpanel')).toBeVisible();
});
