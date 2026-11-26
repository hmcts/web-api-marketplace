import { Page, expect, test } from '@playwright/test';

import { EntraSignInPage } from '../page-objects/pages/entra-sign-in.po';

import { config } from './config.utils';

export type TestAccount = 'user' | 'admin';

// Users in docker/entra-mock.json, kept apart from the ones people sign in as by hand. The admin
// holds the amp_admin app role.
const MOCK_USERNAMES: Record<TestAccount, string> = {
  user: 'functional@amp.com',
  admin: 'functional-admin@amp.com',
};

/**
 * Signs in as the given test account, through whichever sign-in the environment uses: Entra
 * External ID with the account's real credentials, or the mock's username form.
 *
 * Skips the calling test where sign in is switched off (preview), or where the environment signs
 * in through Entra but has no credentials for this account.
 */
export async function signIn(page: Page, account: TestAccount = 'user'): Promise<void> {
  const signInPage = await page.request.get('/sign-in', { maxRedirects: 0 });
  test.skip(signInPage.status() === 503, 'Sign in is not available in this environment');

  if (isEntraExternalId(signInPage.headers()['location'])) {
    const credentials = config.accounts[account];
    test.skip(!credentials, `No ${account} test account is set for this environment`);
    await page.goto('/sign-in');
    await new EntraSignInPage(page).signIn(credentials!.email, credentials!.password);
  } else {
    await page.goto('/sign-in');
    await page.locator('input[name="username"]').fill(MOCK_USERNAMES[account]);
    await page.locator('input[type="submit"]').click();
  }

  await expect(page.locator('h1')).toContainText('Your account');
}

function isEntraExternalId(location: string | undefined): boolean {
  if (!location) {
    return false;
  }
  try {
    return new URL(location).hostname.endsWith('.ciamlogin.com');
  } catch {
    return false;
  }
}
