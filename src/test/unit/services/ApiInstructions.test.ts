import { getCatalogueApi, tokenScopes } from '../../../main/services/ApiCatalogue';
import { SLC_SHORT_CODE, instructionsFor, publisherId } from '../../../main/services/ApiInstructions';
import { ApiSubscription, Application } from '../../../main/services/Applications';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  tokenScopes: jest.fn(),
  getCatalogueApi: jest.fn(),
}));

const mockedScopes = tokenScopes as jest.MockedFunction<typeof tokenScopes>;
const mockedApi = getCatalogueApi as jest.MockedFunction<typeof getCatalogueApi>;

const RCC_SHORT_CODE = 'rcc';
const PORTAL: Record<string, string> = {
  [SLC_SHORT_CODE]: 'https://amp-portal.example.net/api-details#api=stub-slc',
  [RCC_SHORT_CODE]: 'https://amp-portal.example.net/api-details#api=stub-rcc',
};
/** Each API's own Entra resource application, which the marketplace holds against it. */
const SLC_APP_ID = 'c4c8974c-2800-4fe6-964f-dcd4c0820507';
const RCC_APP_ID = '97c20454-55c1-45b0-88cd-268db572f615';
/** SLC's, stood in only when the marketplace cannot be reached. */
const CONFIGURED_FALLBACK = '30288840-e345-4543-99ee-f9253d789339';

const subscription = (shortCode: string, apiTitle: string): ApiSubscription => ({
  shortCode,
  apiTitle,
  publisherId: 'apim-product',
  subscriptionName: `amp-temp-${shortCode}`,
  subscribedAt: '2026-10-15T12:00:00',
});

const SLC = subscription(SLC_SHORT_CODE, 'Scheduling and Listing Court Schedule');
const RCC = subscription(RCC_SHORT_CODE, 'Refdata Court Hearing Courthouses');

const application = (apis: ApiSubscription[], tenantId = 'tenant-1'): Application => ({
  id: 'client-1',
  clientId: 'client-1',
  tenantId,
  name: 'Case Viewer',
  secretHint: 'Uc6',
  secretExpiresAt: '2028-10-15T12:00:00',
  createdAt: '2026-10-15T12:00:00',
  apis,
  accessGranted: true,
});

describe('ApiInstructions', () => {
  beforeEach(() => {
    mockedScopes.mockReset();
    mockedScopes.mockResolvedValue({
      [SLC_SHORT_CODE]: `${SLC_APP_ID}/.default`,
      [RCC_SHORT_CODE]: `${RCC_APP_ID}/.default`,
    });
    mockedApi.mockReset();
    mockedApi.mockImplementation(async shortCode => ({ shortCode, title: shortCode, portalUrl: PORTAL[shortCode] }));
  });

  test('there_should_be_instructions_for_each_api_the_application_has_and_no_other', async () => {
    expect(Object.keys(await instructionsFor(application([SLC, RCC])))).toEqual([SLC_SHORT_CODE, RCC_SHORT_CODE]);
    expect(await instructionsFor(application([]))).toEqual({});
  });

  test('each_api_should_carry_its_own_title', async () => {
    const all = await instructionsFor(application([SLC, RCC]));

    expect(all[SLC_SHORT_CODE].apiTitle).toBe('Scheduling and Listing Court Schedule');
    expect(all[RCC_SHORT_CODE].apiTitle).toBe('Refdata Court Hearing Courthouses');
  });

  test('each_api_should_have_its_own_publisher_id_and_scope', async () => {
    const all = await instructionsFor(application([SLC, RCC]));

    expect(all[SLC_SHORT_CODE].token).toEqual({
      url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
      clientId: 'client-1',
      clientSecret: '<client_secret>',
      publisherId: SLC_APP_ID,
      scope: `${SLC_APP_ID}/.default`,
    });
    expect(all[RCC_SHORT_CODE].token.publisherId).toBe(RCC_APP_ID);
    expect(all[RCC_SHORT_CODE].token.scope).toBe(`${RCC_APP_ID}/.default`);
  });

  test('without_a_tenant_from_the_backend_the_request_should_keep_a_placeholder', async () => {
    expect((await instructionsFor(application([SLC], '')))[SLC_SHORT_CODE].token.url).toBe(
      'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token'
    );
  });

  test('each_api_should_point_to_its_own_page_in_the_developer_portal', async () => {
    const all = await instructionsFor(application([SLC, RCC]));

    expect(all[SLC_SHORT_CODE].portalUrl).toBe(PORTAL[SLC_SHORT_CODE]);
    expect(all[RCC_SHORT_CODE].portalUrl).toBe(PORTAL[RCC_SHORT_CODE]);
  });

  test('an_api_the_catalogue_no_longer_lists_should_leave_the_portal_link_out', async () => {
    mockedApi.mockResolvedValue(undefined);

    expect((await instructionsFor(application([RCC])))[RCC_SHORT_CODE].portalUrl).toBeUndefined();
  });

  test('the_instructions_should_hold_no_endpoint_urls_of_their_own', async () => {
    expect(Object.keys((await instructionsFor(application([RCC])))[RCC_SHORT_CODE]).sort()).toEqual([
      'apiTitle',
      'portalUrl',
      'shortCode',
      'token',
    ]);
  });

  test('a_marketplace_that_cannot_be_reached_should_fall_back_to_the_configured_id_for_slc_alone', async () => {
    mockedScopes.mockResolvedValue({});

    expect(await publisherId(SLC_SHORT_CODE)).toBe(CONFIGURED_FALLBACK);
    // That configured ID is SLC's app, so no other API is shown it.
    expect(await publisherId(RCC_SHORT_CODE)).toBe('{publisher_id}');
    expect((await instructionsFor(application([RCC])))[RCC_SHORT_CODE].token.scope).toBe('{publisher_id}/.default');
  });
});
