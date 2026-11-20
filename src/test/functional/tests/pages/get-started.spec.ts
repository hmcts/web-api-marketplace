import { expect, test } from '../../fixtures';

test.describe('Get started', () => {
  test('the_get_started_page_should_explain_browsing_and_try_it_now_as_separate_steps', async ({ page }) => {
    await page.goto('/get-started');

    await expect(page.locator('#main-content h3')).toHaveText([
      '1. Read the consumer guidance',
      '2. Browse the catalogue',
      '3. Confirm your use case',
      '4. Test the APIs - Try it now',
      '5. Apply for production access',
    ]);
    await expect(page.locator('#browse-the-catalogue')).toBeVisible();
    await expect(page.locator('#test-the-apis')).toBeVisible();
  });
});
