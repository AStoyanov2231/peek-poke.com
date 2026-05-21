import { test, expect } from '@playwright/test';

test('inbox page loads with title', async ({ page }) => {
  await page.goto('/inbox');
  await expect(page.getByText('Inbox')).toBeVisible();
});

test('all three tabs are visible', async ({ page }) => {
  await page.goto('/inbox');
  await expect(page.getByRole('tab', { name: 'Chats' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Friends' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Requests' })).toBeVisible();
});

test('switching tabs changes the active panel', async ({ page }) => {
  await page.goto('/inbox');
  await page.getByRole('tab', { name: 'Friends' }).click();
  await expect(page.getByRole('tab', { name: 'Friends' })).toHaveAttribute('data-state', 'active');

  await page.getByRole('tab', { name: 'Requests' }).click();
  await expect(page.getByRole('tab', { name: 'Requests' })).toHaveAttribute('data-state', 'active');
});

test('chat history and message input visible when a thread is open', async ({ page }) => {
  // Use a desktop viewport so the right-panel chat view is rendered
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/inbox');

  const firstThread = page.locator('[role="listitem"]').first();
  if ((await firstThread.count()) === 0) {
    // No conversations seeded for the test user — skip rather than fail
    test.skip();
    return;
  }
  await firstThread.click();
  // The InboxChatPanel should show a message input on desktop
  await expect(page.getByRole('textbox', { name: /message/i }).or(
    page.getByPlaceholder(/message/i)
  )).toBeVisible();
});

test('send button is present in chat view', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/inbox');

  const firstThread = page.locator('[role="listitem"]').first();
  if ((await firstThread.count()) === 0) {
    test.skip();
    return;
  }
  await firstThread.click();
  await expect(page.getByRole('button', { name: /send/i })).toBeVisible();
});
