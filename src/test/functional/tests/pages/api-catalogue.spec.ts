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

  test('browsing_the_catalogue_should_group_apis_under_letters', async ({ apiCataloguePage }) => {
    await apiCataloguePage.goto();

    await expect(apiCataloguePage.count).toContainText(/\d+ APIs?/);
    await expect(apiCataloguePage.lettersNav).toBeVisible();
  });

  test('searching_the_catalogue_should_list_only_matching_apis', async ({ apiCataloguePage }) => {
    await apiCataloguePage.goto();
    await apiCataloguePage.search('Defendant');

    await expect(apiCataloguePage.page).toHaveURL(/\?q=Defendant/);
    await expect(apiCataloguePage.count).toContainText('matching');
    await expect(apiCataloguePage.page.getByRole('link', { name: 'Clear search' })).toBeVisible();
    await expect(apiCataloguePage.apiLink('dl')).toBeVisible();
    await expect(apiCataloguePage.apiLink('slc')).toHaveCount(0);
  });

  for (const shortCode of ['pcd', 'dl']) {
    test(`the_${shortCode}_api_should_be_listed_with_its_own_page`, async ({ apiCataloguePage, axeUtils }) => {
      await apiCataloguePage.goto();
      await expect(apiCataloguePage.apiLink(shortCode)).toBeVisible();

      const response = await apiCataloguePage.page.goto(`/api-catalogue/${shortCode}`);

      expect(response?.status()).toBe(200);
      await expect(apiCataloguePage.aboutThisApi).toContainText(shortCode);
      await axeUtils.audit();
    });
  }

  test('an_api_page_should_link_to_the_developer_portal_rather_than_github_pages', async ({ apiCataloguePage }) => {
    await apiCataloguePage.goto();
    await apiCataloguePage.openFirstApi();

    await expect(apiCataloguePage.page.locator('#main-content a[href*="hmcts.github.io"]')).toHaveCount(0);
    test.skip((await apiCataloguePage.referenceLink.count()) === 0, 'No developer portal link in this environment');
    await expect(apiCataloguePage.referenceLink).toHaveAttribute('href', /^https:\/\/.+\/api-details#api=/);
    await expect(apiCataloguePage.referenceLink).toHaveAttribute('target', '_blank');
    await expect(apiCataloguePage.referenceLink).toHaveAttribute('rel', /noopener/);
  });

  test('an_api_page_should_explain_how_browsing_differs_from_try_it_now', async ({ apiCataloguePage }) => {
    await apiCataloguePage.goto();
    await apiCataloguePage.openFirstApi();

    await expect(
      apiCataloguePage.page.getByRole('link', { name: 'how browsing differs from Try it now' })
    ).toHaveAttribute('href', '/get-started#browse-the-catalogue');
  });

  test('an_api_the_catalogue_does_not_list_should_answer_404', async ({ page }) => {
    const response = await page.goto('/api-catalogue/no-such-api');

    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
  });
});
