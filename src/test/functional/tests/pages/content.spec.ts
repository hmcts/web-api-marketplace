import { expect, test } from '../../fixtures';

const pages = [
  { path: '/get-started', heading: 'Getting started with our APIs' },
  { path: '/documentation', heading: 'Documentation' },
  { path: '/documentation/consumer-guidance', heading: 'Consumer guidance' },
  { path: '/documentation/producer-guidance', heading: 'Producer guidance' },
  { path: '/documentation/producer-standards', heading: 'Producer standards' },
  { path: '/help', heading: 'Help and support' },
  { path: '/privacy', heading: 'Privacy notice' },
  { path: '/cookies', heading: 'Cookies' },
  { path: '/accessibility-statement', heading: 'Accessibility statement for the HMCTS API Marketplace' },
];

test.describe('Content pages', () => {
  for (const { path, heading } of pages) {
    test(`${path}_should_show_its_heading_with_no_accessibility_violations`, async ({ page, axeUtils }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toContainText(heading);
      await axeUtils.audit();
    });
  }

  test('an_unknown_page_should_answer_404_with_the_not_found_page', async ({ page }) => {
    const response = await page.goto('/no-such-page');

    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
  });
});
