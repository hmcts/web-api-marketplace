import { expect, test } from '../../fixtures';

const retiredPages = ['/documentation/producer-guidance', '/documentation/producer-standards'];

test.describe('Documentation', () => {
  test(
    'the_documentation_page_should_split_the_guides_for_consumers_and_producers',
    { tag: '@a11y' },
    async ({ page, axeUtils }) => {
      await page.goto('/documentation');

      await expect(page.locator('h2#consumers')).toHaveText('For API consumers');
      await expect(page.locator('h2#producers')).toHaveText('For API producers');
      await expect(page.getByRole('link', { name: 'Consumer guidance' })).toHaveAttribute(
        'href',
        '/documentation/consumer-guidance'
      );
      await expect(page.getByRole('link', { name: 'Producer Onboarding' })).toHaveAttribute(
        'href',
        '/documentation/producer-onboarding'
      );
      await axeUtils.audit();
    }
  );

  for (const path of retiredPages) {
    test(`${path}_should_answer_404_now_the_page_is_retired`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(404);
      await expect(page.locator('h1')).toHaveText('Page not found');
    });
  }

  for (const path of ['/documentation', '/documentation/producer-onboarding', '/help']) {
    test(`${path}_should_not_link_to_a_retired_producer_page`, async ({ page }) => {
      await page.goto(path);

      await expect(page.locator('#main-content a[href*="producer-guidance"]')).toHaveCount(0);
      await expect(page.locator('#main-content a[href*="producer-standards"]')).toHaveCount(0);
    });
  }

  test('the_producer_onboarding_page_should_show_what_a_producer_needs_and_how_to_onboard', async ({ page }) => {
    await page.goto('/documentation/producer-onboarding');

    await expect(page.locator('h1')).toHaveText('Producer Onboarding');
    for (const heading of [
      'Before you start',
      'How it fits together',
      'How onboarding works',
      'What you get',
      'Get in touch',
    ]) {
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    }
    await expect(page.locator('#main-content a[href="#before-you-start"]').first()).toBeVisible();
    await expect(page.locator('#main-content a[href="mailto:APIMarketplace@hmcts.net"]').first()).toBeVisible();
    await expect(page.locator('.govuk-breadcrumbs')).toContainText('Documentation');
  });

  test('the_help_page_should_point_api_owners_to_producer_onboarding', async ({ page }) => {
    await page.goto('/help');

    await expect(page.getByRole('link', { name: 'Producer Onboarding' })).toHaveAttribute(
      'href',
      '/documentation/producer-onboarding'
    );
  });
});
