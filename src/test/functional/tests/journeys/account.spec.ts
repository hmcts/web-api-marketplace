import { Page } from '@playwright/test';

import { expect, test } from '../../fixtures';
import { config } from '../../utils/config.utils';
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

async function createTestApplication(page: Page, api?: string): Promise<void> {
  await page.goto('/account/applications/new/details');
  await page.getByLabel('What is your application name?').fill(appName);
  await page.getByRole('button', { name: 'Continue' }).click();
  const apis = page.locator('input[name="apis"]');
  await (api ? apis.and(page.locator(`[value="${api}"]`)) : apis.first()).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create application' }).click();
}

test.describe('Signed in', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!JOURNEY_PROJECTS.includes(testInfo.project.name), 'Signed-in journeys run in chrome and edge only');
    appName = `Web Functional ${testInfo.project.name}`;
    await signIn(page);
    await deleteTestApplication(page);
  });

  // Playwright runs afterEach for a test skipped in beforeEach, before appName is set, and a
  // link named undefined matches every link on the page
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.expectedStatus === 'skipped') {
      return;
    }
    await deleteTestApplication(page);
  });

  test('an_application_should_be_created_listed_and_deleted', { tag: '@a11y' }, async ({ page, axeUtils }) => {
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

  test(
    'an_application_should_show_its_details_and_its_slc_key_should_return_try_it_now_scenarios',
    { tag: '@a11y' },
    async ({ page, axeUtils }) => {
      await createTestApplication(page, 'slc');
      await page.goto('/account/applications');
      await page.getByRole('link', { name: appName }).click();

      await expect(page.locator('h1')).toHaveText(appName);
      await expect(page.locator('#client-id')).not.toBeEmpty();
      await expect(page.locator('#masked-secret')).not.toBeEmpty();
      await expect(page.locator('#application-apis')).toBeVisible();
      await axeUtils.audit();

      await page.locator('#application-apis a[href$="/apis/slc"]').click();

      await expect(page.locator('#subscription-key-unavailable')).toHaveCount(0);
      await page.locator('#show-subscription-key summary').click();
      await expect(page.locator('#subscription-key')).not.toBeEmpty();
      await axeUtils.audit();

      // Where a real APIM issued the key, the consumer can call Try It Now with it straight away.
      // The stack, preview and local runs have no gateway, and their keys are made up.
      const gateway = config.apiGatewayHost;
      if (gateway) {
        const key = (await page.locator('#subscription-key').innerText()).trim();
        const scenarios = () =>
          page.request.get(`https://${gateway}/amp/try/slc/scenarios`, {
            headers: { 'Ocp-Apim-Subscription-Key': key },
          });

        await expect.poll(async () => (await scenarios()).status(), { timeout: 30_000 }).toBe(200);
        const body = await (await scenarios()).json();
        expect(body.api).toBe('slc');
        expect(Array.isArray(body.scenarios)).toBe(true);
        expect(body.description).toContain('no Common Platform data is reachable');
      }
    }
  );

  test('a_name_that_is_too_short_should_show_an_error', { tag: '@a11y' }, async ({ page, axeUtils }) => {
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

  test(
    'production_credentials_should_be_requested_for_an_application',
    { tag: '@a11y' },
    async ({ page, axeUtils }) => {
      await createTestApplication(page);

      await page.goto('/account/production-credentials');
      await expect(page.locator('h1')).toHaveText('Request production credentials');
      await axeUtils.audit();
      await page.getByRole('radio', { name: appName }).check();
      await page.getByRole('radio', { name: 'Other external organisation' }).check();
      await page.getByLabel('Team name (and organisation if external to HMCTS?)').fill('Web Functional Test Ltd');
      const goLive = new Date();
      goLive.setFullYear(goLive.getFullYear() + 1);
      await page.getByLabel('Day').fill(String(goLive.getDate()));
      await page.getByLabel('Month').fill(String(goLive.getMonth() + 1));
      await page.getByLabel('Year').fill(String(goLive.getFullYear()));
      await page.locator('input[name="call-volume"]').first().check();
      await page.locator('textarea').nth(0).fill('Court schedules for an automated functional test.');
      await page.getByLabel('Me/my immediate team only').check();
      await page.getByRole('radio', { name: 'No', exact: true }).check();
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page.locator('h1')).toHaveText('Check your answers before submitting');
      await axeUtils.audit();
      await page.getByRole('button', { name: 'Accept and submit' }).click();

      await expect(page.locator('.govuk-panel__title')).toHaveText('Request submitted');
    }
  );

  test('signing_out_should_end_the_session', async ({ page }) => {
    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out' }).click();

    const response = await page.request.get('/account', { maxRedirects: 0 });
    expect(response.headers()['location']).toBe('/sign-in');
  });
});
