import { BrowserContext, Page, expect, test } from '@playwright/test';

import { EntraSignInPage } from '../page-objects/pages/entra-sign-in.po';

import { config } from './config.utils';

export type TestAccount = 'user' | 'admin';

// Users in docker/entra-mock.json, kept apart from the ones people sign in as by hand. The admin
// holds the amp_admin app role.
const MOCK_USERNAMES: Record<TestAccount, string> = {
  user: 'functional@amp.com',
  admin: 'functional-admin@amp.com',
};

type Cookies = Awaited<ReturnType<BrowserContext['cookies']>>;

// One signed-in session per account in each worker. A worker runs its tests one at a time, so no two
// tests share a session at once, and a session is only signed in again when it has ended.
const sessions = new Map<TestAccount, Cookies>();

/**
 * Signs in as the given test account, through whichever sign-in the environment uses: Entra
 * External ID with the account's real credentials, or the mock's username form. A later test in the
 * same worker reuses that session rather than signing in again, so long as it is still signed in.
 *
 * Skips the calling test where sign in is switched off (preview), or where the environment signs
 * in through Entra but has no credentials for this account.
 */
export async function signIn(page: Page, account: TestAccount = 'user'): Promise<void> {
  if (await reuseSession(page, account)) {
    return;
  }

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
  sessions.set(account, await page.context().cookies());
}

async function reuseSession(page: Page, account: TestAccount): Promise<boolean> {
  const cookies = sessions.get(account);
  if (!cookies) {
    return false;
  }
  await page.context().addCookies(cookies);
  await page.goto('/account');
  if (
    new URL(page.url()).pathname === '/account' &&
    (await page.locator('h1').textContent())?.includes('Your account')
  ) {
    return true;
  }
  // Signed out since, for instance by the sign-out journey
  sessions.delete(account);
  await page.context().clearCookies();
  return false;
}

/** The email the given test account signs in with, whichever sign-in the environment uses. */
export function accountEmail(account: TestAccount): string {
  return config.accounts[account]?.email ?? MOCK_USERNAMES[account];
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
