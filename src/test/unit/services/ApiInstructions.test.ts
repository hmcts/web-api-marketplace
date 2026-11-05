import { tokenScopes } from '../../../main/services/ApiCatalogue';
import { SLC_API_NAME, instructionsFor, publisherId } from '../../../main/services/ApiInstructions';
import { ApiSubscription, Application } from '../../../main/services/Applications';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  tokenScopes: jest.fn(),
}));

const mockedScopes = tokenScopes as jest.MockedFunction<typeof tokenScopes>;

const RCC_API_NAME = 'api-cp-refdata-courthearing-courthouses';
/** Each API's own Entra resource application, which the marketplace holds against it. */
const SLC_APP_ID = 'c4c8974c-2800-4fe6-964f-dcd4c0820507';
const RCC_APP_ID = '97c20454-55c1-45b0-88cd-268db572f615';
/** SLC's, stood in only when the marketplace cannot be reached. */
const CONFIGURED_FALLBACK = '30288840-e345-4543-99ee-f9253d789339';

const subscription = (apiName: string, apiTitle: string): ApiSubscription => ({
  apiName,
  apiTitle,
  publisherId: 'apim-product',
  subscriptionName: `amp-temp-${apiName}`,
  subscribedAt: '2026-10-15T12:00:00',
});

const SLC = subscription(SLC_API_NAME, 'Scheduling and Listing Court Schedule');
const RCC = subscription(RCC_API_NAME, 'Refdata Court Hearing Courthouses');

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
      [SLC_API_NAME]: `${SLC_APP_ID}/.default`,
      [RCC_API_NAME]: `${RCC_APP_ID}/.default`,
    });
  });

  test('there_should_be_instructions_for_each_api_the_application_has_and_no_other', async () => {
    expect(Object.keys(await instructionsFor(application([SLC, RCC])))).toEqual([SLC_API_NAME, RCC_API_NAME]);
    expect(await instructionsFor(application([]))).toEqual({});
  });

  test('each_api_should_carry_its_own_title', async () => {
    const all = await instructionsFor(application([SLC, RCC]));

    expect(all[SLC_API_NAME].apiTitle).toBe('Scheduling and Listing Court Schedule');
    expect(all[RCC_API_NAME].apiTitle).toBe('Refdata Court Hearing Courthouses');
  });

  test('each_api_should_have_its_own_publisher_id_and_scope', async () => {
    const all = await instructionsFor(application([SLC, RCC]));

    expect(all[SLC_API_NAME].token).toEqual({
      url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
      clientId: 'client-1',
      clientSecret: '<client_secret>',
      publisherId: SLC_APP_ID,
      scope: `${SLC_APP_ID}/.default`,
    });
    expect(all[RCC_API_NAME].token.publisherId).toBe(RCC_APP_ID);
    expect(all[RCC_API_NAME].token.scope).toBe(`${RCC_APP_ID}/.default`);
  });

  test('without_a_tenant_from_the_backend_the_request_should_keep_a_placeholder', async () => {
    expect((await instructionsFor(application([SLC], '')))[SLC_API_NAME].token.url).toBe(
      'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token'
    );
  });

  test('each_api_should_point_to_its_own_api_reference_for_its_endpoints', async () => {
    const all = await instructionsFor(application([SLC, RCC]));

    expect(all[SLC_API_NAME].docsUrl).toBe(`https://hmcts.github.io/${SLC_API_NAME}/`);
    expect(all[RCC_API_NAME].docsUrl).toBe(`https://hmcts.github.io/${RCC_API_NAME}/`);
  });

  test('the_instructions_should_hold_no_endpoint_urls_of_their_own', async () => {
    expect(Object.keys((await instructionsFor(application([RCC])))[RCC_API_NAME]).sort()).toEqual([
      'apiName',
      'apiTitle',
      'docsUrl',
      'token',
    ]);
  });

  test('a_marketplace_that_cannot_be_reached_should_fall_back_to_the_configured_id_for_slc_alone', async () => {
    mockedScopes.mockResolvedValue({});

    expect(await publisherId(SLC_API_NAME)).toBe(CONFIGURED_FALLBACK);
    // That configured ID is SLC's app, so no other API is shown it.
    expect(await publisherId(RCC_API_NAME)).toBe('{publisher_id}');
    expect((await instructionsFor(application([RCC])))[RCC_API_NAME].token.scope).toBe('{publisher_id}/.default');
  });
});
