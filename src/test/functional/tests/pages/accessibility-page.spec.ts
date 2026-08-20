import { test } from '../../fixtures';

test.describe('Accessibility Page Visual & Language Checks', () => {
  test('should load and display correct content sections (english)', async ({ accessibilityPage }) => {
    await accessibilityPage.goto('en');
    await accessibilityPage.expectVisibleElements();
    // ensure the language selection has the Welsh/Cymraeg toggle
    await accessibilityPage.expectLanguageLinkToContainText('Cymraeg');
  });

  test('should load and display correct content sections (welsh)', async ({ accessibilityPage }) => {
    await accessibilityPage.goto('cy');
    await accessibilityPage.expectVisibleElements();
    // ensure the language selection has the English toggle
    await accessibilityPage.expectLanguageLinkToContainText('English');
  });

  test('should maintain preselected language during navigation', async ({ accessibilityPage, homePage }) => {
    await homePage.goto('en');
    await accessibilityPage.goto();
    await accessibilityPage.expectVisibleElements();
    // ensure the language selection has the Cymraeg toggle
    await accessibilityPage.expectLanguageLinkToContainText('Cymraeg');

    await homePage.goto('cy');
    await accessibilityPage.goto();
    await accessibilityPage.expectVisibleElements();
    // ensure the language selection has the English toggle
    await accessibilityPage.expectLanguageLinkToContainText('English');
  });
});

test.describe('Accessibility Page Content Checks', () => {
  test('should have content and show the correct page heading (english)', async ({ accessibilityPage }) => {
    await accessibilityPage.goto('en');
    await accessibilityPage.expectMainContentToBePopulated();
    await accessibilityPage.expectHeadingToContainText(
      'Accessibility statement for the ‘Find a Court or Tribunal’ service'
    );
  });

  test('should have content and show the correct page heading (welsh)', async ({ accessibilityPage }) => {
    await accessibilityPage.goto('cy');
    await accessibilityPage.expectMainContentToBePopulated();
    await accessibilityPage.expectHeadingToContainText(
      'Datganiad hygyrchedd ar gyfer y gwasanaeth ‘Dod o hyd i lys neu dribiwnlys’'
    );
  });
});
