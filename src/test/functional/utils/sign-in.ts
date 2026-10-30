import { Page, expect, test } from '@playwright/test';

// A user in docker/entra-mock.json, kept apart from the ones people sign in as by hand
const TEST_USERNAME = 'functional@amp.com';

/** Skips the calling test where sign in is switched off, as on preview and AAT. */
export async function signIn(page: Page): Promise<void> {
  const signInPage = await page.request.get('/sign-in', { maxRedirects: 0 });
  test.skip(signInPage.status() === 503, 'Sign in is not available in this environment');

  await page.goto('/sign-in');
  await page.locator('input[name="username"]').fill(TEST_USERNAME);
  await page.locator('input[type="submit"]').click();
  await expect(page.locator('h1')).toContainText('Your account');
}
