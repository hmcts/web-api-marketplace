import { Page } from '@playwright/test';

import { expect, test } from '../../fixtures';
import { signIn } from '../../utils/sign-in';

// The service allows each user 5 applications, and every browser project signs in as the same
// user, so the journeys run in desktop Chromium only, one at a time, each under its own name
const JOURNEY_PROJECTS = ['chrome', 'edge'];
let appName: string;

async function deleteTestApplication(page: Page): Promise<void> {
  await page.goto('/account/applications');
  const link = page.getByRole('link', { name: appName });
  if ((await link.count()) === 0) {
    return;
  }
  await link.first().click();
  await page.getByRole('button', { name: 'Delete application' }).click();
  await page.getByRole('button', { name: 'Yes, delete application' }).click();
}

async function createTestApplication(page: Page): Promise<void> {
  await page.goto('/account/applications/new/details');
  await page.getByLabel('What is your application name?').fill(appName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[name="apis"]').first().check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create application' }).click();
}

test.describe('Signed out', () => {
  test('the_account_page_should_send_a_signed_out_user_to_sign_in', async ({ request }) => {
    const response = await request.get('/account', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe('/sign-in');
  });
});

test.describe('Signed in', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!JOURNEY_PROJECTS.includes(testInfo.project.name), 'Signed-in journeys run in chrome and edge only');
    appName = `Web Functional ${testInfo.project.name}`;
    await signIn(page);
    await deleteTestApplication(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteTestApplication(page);
  });

  test('an_application_should_be_created_listed_and_deleted', async ({ page, axeUtils }) => {
    await page.goto('/account/applications/new');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('h1')).toHaveText('Application details');
    await axeUtils.audit();
    await page.getByLabel('What is your application name?').fill(appName);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('h1')).toHaveText('Choose APIs');
    await axeUtils.audit();
    await page.locator('input[name="apis"]').first().check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('h1')).toHaveText('Check your answers before creating your application');
    await axeUtils.audit();
    await page.getByRole('button', { name: 'Create application' }).click();

    await expect(page.locator('.govuk-panel__title')).toHaveText('Application created');
    await expect(page.locator('#client-id')).not.toBeEmpty();

    await page.goto('/account/applications');
    await expect(page.getByRole('link', { name: appName })).toBeVisible();

    await deleteTestApplication(page);
    await expect(page.getByRole('link', { name: appName })).toHaveCount(0);
  });

  test('a_name_that_is_too_short_should_show_an_error', async ({ page, axeUtils }) => {
    await page.goto('/account/applications/new/details');
    await page.getByLabel('What is your application name?').fill('Short');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('.govuk-error-summary')).toContainText('There is a problem');
    await axeUtils.audit();
  });

  test('choosing_no_api_should_show_an_error', async ({ page }) => {
    await page.goto('/account/applications/new/details');
    await page.getByLabel('What is your application name?').fill(appName);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('.govuk-error-summary')).toContainText('There is a problem');
  });

  test('production_credentials_should_be_requested_for_an_application', async ({ page, axeUtils }) => {
    await createTestApplication(page);

    await page.goto('/account/production-credentials');
    await expect(page.locator('h1')).toHaveText('Request production credentials');
    await axeUtils.audit();
    await page.getByRole('radio', { name: appName }).check();
    await page.getByLabel('Organisation or team name').fill('Web Functional Test Ltd');
    const goLive = new Date();
    goLive.setFullYear(goLive.getFullYear() + 1);
    await page.getByLabel('Day').fill(String(goLive.getDate()));
    await page.getByLabel('Month').fill(String(goLive.getMonth() + 1));
    await page.getByLabel('Year').fill(String(goLive.getFullYear()));
    await page.locator('input[name="call-volume"]').first().check();
    await page.locator('textarea').nth(0).fill('Court schedules for an automated functional test.');
    await page.locator('textarea').nth(1).fill('None: this request is made by an automated test.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('h1')).toHaveText('Check your answers before submitting');
    await axeUtils.audit();
    await page.getByRole('button', { name: 'Accept and submit' }).click();

    await expect(page.locator('.govuk-panel__title')).toHaveText('Request submitted');
  });

  test('signing_out_should_end_the_session', async ({ page }) => {
    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out' }).click();

    const response = await page.request.get('/account', { maxRedirects: 0 });
    expect(response.headers()['location']).toBe('/sign-in');
  });
});
