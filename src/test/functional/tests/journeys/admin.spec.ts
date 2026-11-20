import { expect, test } from '../../fixtures';

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
