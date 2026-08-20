import { test } from '../../fixtures';

test.describe('Not Found Page Visual & Language Checks', () => {
  test('should load and display correct content sections (english)', async ({ notFoundPage }) => {
    await notFoundPage.goto('en');
    await notFoundPage.expectVisibleElements();
    // ensure the language selection has the Welsh/Cymraeg toggle
    await notFoundPage.expectLanguageLinkToContainText('Cymraeg');
  });

  test('should load and display correct content sections (welsh)', async ({ notFoundPage }) => {
    await notFoundPage.goto('cy');
    await notFoundPage.expectVisibleElements();
    // ensure the language selection has the English toggle
    await notFoundPage.expectLanguageLinkToContainText('English');
  });

  test('should maintain preselected language during navigation', async ({ notFoundPage, homePage }) => {
    await homePage.goto('en');
    await notFoundPage.goto();
    await notFoundPage.expectVisibleElements();
    // ensure the language selection has the Cymraeg toggle
    await notFoundPage.expectLanguageLinkToContainText('Cymraeg');

    await homePage.goto('cy');
    await notFoundPage.goto();
    await notFoundPage.expectVisibleElements();
    // ensure the language selection has the English toggle
    await notFoundPage.expectLanguageLinkToContainText('English');
  });
});

test.describe('Not Found Page Content Checks', () => {
  test('should have content and show the correct page heading (english)', async ({ notFoundPage }) => {
    await notFoundPage.goto('en');
    await notFoundPage.expectMainContentToBePopulated();
    await notFoundPage.expectHeadingToContainText('Find a Court or Tribunal');
  });

  test('should have content and show the correct page heading (welsh)', async ({ notFoundPage }) => {
    await notFoundPage.goto('cy');
    await notFoundPage.expectMainContentToBePopulated();
    await notFoundPage.expectHeadingToContainText('Dod o hyd i lys neu dribiwnlys');
  });
});
