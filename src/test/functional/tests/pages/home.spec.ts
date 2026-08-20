import { test } from '../../fixtures';

test.describe('Home page', () => {
  test('loading_the_home_page_in_english_should_offer_the_welsh_toggle', { tag: '@smoke' }, async ({ homePage }) => {
    await homePage.goto('en');
    await homePage.expectVisibleElements();
    await homePage.expectLanguageLinkToContainText('Cymraeg');
  });

  test('loading_the_home_page_in_welsh_should_offer_the_english_toggle', async ({ homePage }) => {
    await homePage.goto('cy');
    await homePage.expectVisibleElements();
    await homePage.expectLanguageLinkToContainText('English');
  });

  test('loading_the_home_page_should_show_the_heading_and_populated_content', async ({ homePage }) => {
    await homePage.goto('en');
    await homePage.expectMainContentToBePopulated();
    await homePage.expectHeadingToContainText('Hello world');
  });

  test('loading_the_home_page_should_not_show_a_back_link', async ({ homePage }) => {
    await homePage.goto('en');
    await homePage.expectBackLinkNotVisible();
  });
});
