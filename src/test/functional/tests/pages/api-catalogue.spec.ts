import { expect, test } from '../../fixtures';

test.describe('API catalogue', () => {
  // The catalogue is served by the marketplace backend, which preview does not deploy — the web
  // chart depends on nodejs alone, so API_URL resolves to nothing there and the page has no APIs
  // to list. Skipping keeps the assertions real wherever a backend answers rather than loosening
  // them everywhere, as the sign-in smoke test does for ENTRA_ENABLED=false.
  test.beforeEach(async ({ request }) => {
    const backend = await request.get('/backend-check');

    test.skip(backend.status() !== 200, 'No backend in this environment, so the catalogue is empty');
  });

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
