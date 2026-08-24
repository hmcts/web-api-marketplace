import { test } from '../../fixtures';

test.describe('Home page', () => {
  test('loading_the_home_page_should_show_the_heading', { tag: '@smoke' }, async ({ homePage }) => {
    await homePage.goto();
    await homePage.expectVisibleElements();
    await homePage.expectHeadingToContainText('Hello world');
  });

  test('the_home_page_should_have_no_accessibility_violations', async ({ axeUtils, homePage }) => {
    await homePage.goto();
    await axeUtils.audit();
  });
});
