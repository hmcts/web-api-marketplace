import { test } from '../../fixtures';

test.describe('API catalogue', () => {
  test('the_catalogue_should_list_at_least_one_api', { tag: '@smoke' }, async ({ apiCataloguePage }) => {
    await apiCataloguePage.goto();
    await apiCataloguePage.expectVisibleElements();
    await apiCataloguePage.expectHeadingToContainText('API catalogue');
    await apiCataloguePage.expectAtLeastOneApi();
  });
});
