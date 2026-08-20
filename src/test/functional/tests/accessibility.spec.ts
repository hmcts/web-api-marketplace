import { test } from '../fixtures';

test.describe('Accessibility tests', { tag: '@a11y' }, () => {
  test('auditing_the_home_page_should_report_no_violations', async ({ axeUtils, homePage }) => {
    await homePage.goto();
    await axeUtils.audit();
  });

  test('auditing_the_accessibility_statement_should_report_no_violations', async ({ accessibilityPage, axeUtils }) => {
    await accessibilityPage.goto();
    await axeUtils.audit();
  });

  test('auditing_the_not_found_page_should_report_no_violations', async ({ axeUtils, notFoundPage }) => {
    await notFoundPage.goto();
    await axeUtils.audit();
  });
});
