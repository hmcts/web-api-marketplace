import { expect, test } from '../../fixtures';

test.describe('Cookie banner', () => {
  for (const choice of ['Accept', 'Reject'] as const) {
    test(`${choice.toLowerCase()}ing_additional_cookies_should_be_remembered`, async ({ page, context }) => {
      await page.goto('/');
      const banner = page.locator('.cookie-banner');
      await expect(banner).toBeVisible();

      await banner.getByRole('button', { name: `${choice} additional cookies` }).click();
      await expect(banner.getByRole('alert')).toContainText(`You’ve ${choice.toLowerCase()}ed additional cookies`);
      await banner.getByRole('button', { name: 'Hide this message' }).first().click();

      const preferences = (await context.cookies()).find(cookie => cookie.name === 'amp-cookie-preferences');
      expect(JSON.parse(decodeURIComponent(preferences?.value ?? '{}')).analytics).toBe(
        choice === 'Accept' ? 'on' : 'off'
      );

      await page.goto('/help');
      await expect(page.locator('.cookie-banner')).toBeHidden();
    });
  }
});
