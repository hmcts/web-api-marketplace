import { expect, test } from '../../fixtures';

test.describe('API catalogue', () => {
  test('the_catalogue_should_list_at_least_one_api', { tag: '@smoke' }, async ({ apiCataloguePage }) => {
    await apiCataloguePage.goto();
    await apiCataloguePage.expectVisibleElements();
    await apiCataloguePage.expectHeadingToContainText('API catalogue');
    await apiCataloguePage.expectAtLeastOneApi();
  });

  test('an_api_should_open_its_detail_page_with_no_accessibility_violations', async ({
    apiCataloguePage,
    axeUtils,
  }) => {
    await apiCataloguePage.goto();
    await axeUtils.audit();

    const title = await apiCataloguePage.openFirstApi();

    await expect(apiCataloguePage.page).toHaveURL(/\/api-catalogue\/.+/);
    await apiCataloguePage.expectHeadingToContainText(title);
    await axeUtils.audit();
  });
});
