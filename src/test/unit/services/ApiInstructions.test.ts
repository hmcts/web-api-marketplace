import { getCatalogueApi } from '../../../main/services/ApiCatalogue';
import { instructionsFor } from '../../../main/services/ApiInstructions';
import { ApiSubscription, Application } from '../../../main/services/Applications';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  getCatalogueApi: jest.fn(),
}));

const mockedApi = getCatalogueApi as jest.MockedFunction<typeof getCatalogueApi>;

const SLC_SHORT_CODE = 'slc';
const RCC_SHORT_CODE = 'rcc';

/** Each API's own Entra resource application, which the catalogue holds against it. */
const SLC_APP_ID = 'c4c8974c-2800-4fe6-964f-dcd4c0820507';
const RCC_APP_ID = '97c20454-55c1-45b0-88cd-268db572f615';

const CATALOGUE: Record<string, { resourceAppId?: string; portalUrl?: string }> = {
  [SLC_SHORT_CODE]: {
    resourceAppId: SLC_APP_ID,
    portalUrl: 'https://amp-portal.example.net/api-details#api=stub-slc',
  },
  [RCC_SHORT_CODE]: {
    resourceAppId: RCC_APP_ID,
    portalUrl: 'https://amp-portal.example.net/api-details#api=stub-rcc',
  },
};

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
    mockedApi.mockReset();
    mockedApi.mockImplementation(async shortCode => ({ shortCode, title: shortCode, ...CATALOGUE[shortCode] }));
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

  test('one_read_of_the_catalogue_should_serve_both_the_scope_and_the_portal_link', async () => {
    const all = await instructionsFor(application([SLC]));

    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(mockedApi).toHaveBeenCalledWith(SLC_SHORT_CODE);
    expect(all[SLC_SHORT_CODE].token.publisherId).toBe(SLC_APP_ID);
    expect(all[SLC_SHORT_CODE].portalUrl).toBe(CATALOGUE[SLC_SHORT_CODE].portalUrl);
  });

  test('without_a_tenant_from_the_backend_the_request_should_keep_a_placeholder', async () => {
    expect((await instructionsFor(application([SLC], '')))[SLC_SHORT_CODE].token.url).toBe(
      'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token'
    );
  });

  test('an_api_with_no_resource_app_should_show_a_placeholder_rather_than_another_apis_id', async () => {
    mockedApi.mockResolvedValue({ shortCode: RCC_SHORT_CODE, title: 'Courthouses' });

    const token = (await instructionsFor(application([RCC])))[RCC_SHORT_CODE].token;

    expect(token.publisherId).toBe('{publisher_id}');
    expect(token.scope).toBe('{publisher_id}/.default');
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
});
