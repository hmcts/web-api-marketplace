import { expect, test } from '../../fixtures';
import { signIn } from '../../utils/sign-in';

test.describe('Admin, signed out', () => {
  test('the_admin_page_should_send_a_signed_out_user_to_sign_in', async ({ request }) => {
    const response = await request.get('/admin', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe('/sign-in');
  });

  test('a_signed_out_visitor_should_not_be_offered_the_admin_tab', async ({ homePage }) => {
    await homePage.goto();

    await expect(homePage.headerComponent.navigationLinks.filter({ hasText: 'Admin' })).toHaveCount(0);
  });
});

test.describe('Admin, signed in', () => {
  test('an_admin_should_be_offered_the_admin_tab_and_open_the_admin_page', async ({ page, axeUtils }) => {
    await signIn(page, 'admin');

    await page.getByRole('link', { name: 'Admin', exact: true }).click();

    await expect(page.locator('h1')).toHaveText('Admin');
    await axeUtils.audit();
  });

  test('a_signed_in_user_without_the_admin_role_should_not_be_offered_the_admin_tab', async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  test('a_signed_in_user_without_the_admin_role_should_be_told_the_admin_page_does_not_exist', async ({ page }) => {
    await signIn(page);

    const response = await page.goto('/admin');

    expect(response?.status()).toBe(404);
  });
});
