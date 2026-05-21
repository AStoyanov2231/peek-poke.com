import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate as test user', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill('test2@test.com');
  await page.getByPlaceholder('Password').fill('1qaz1qaz');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('/');
  await page.context().storageState({ path: authFile });
});
