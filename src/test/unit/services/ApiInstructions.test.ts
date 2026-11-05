import { ApiProduct, productFor, tokenScopes } from '../../../main/services/ApiCatalogue';
import { SLC_API_NAME, instructionsFor, publisherId } from '../../../main/services/ApiInstructions';
import { ApiSubscription, Application } from '../../../main/services/Applications';

jest.mock('../../../main/services/ApiCatalogue');

const mockedScopes = tokenScopes as jest.MockedFunction<typeof tokenScopes>;
const mockedProduct = productFor as jest.MockedFunction<typeof productFor>;

const RCC_API_NAME = 'api-cp-refdata-courthearing-courthouses';
/** Each API's own Entra resource application, which the marketplace holds against it. */
const SLC_APP_ID = 'c4c8974c-2800-4fe6-964f-dcd4c0820507';
const RCC_APP_ID = '97c20454-55c1-45b0-88cd-268db572f615';
/** SLC's, stood in only when the marketplace cannot be reached. */
const CONFIGURED_FALLBACK = '30288840-e345-4543-99ee-f9253d789339';

const PRODUCTS: Record<string, ApiProduct> = {
  [SLC_API_NAME]: {
    shortCode: 'slc',
    title: 'Scheduling and Listing Court Schedule',
    catalogueName: SLC_API_NAME,
    productId: 'try-it-now-cp-crime-schedulingandlisting',
    gatewayPath: 'amp/try/slc',
    role: 'app.read',
    resourceAppId: SLC_APP_ID,
    exampleCalls: [{ title: 'Get the court schedule for a case', path: '/case/{case_urn}/courtschedule' }],
  },
  [RCC_API_NAME]: {
    shortCode: 'rcc',
    title: 'Refdata Court Hearing Courthouses',
    catalogueName: RCC_API_NAME,
    productId: 'try-it-now-cp-refdata-courthearing',
    gatewayPath: 'amp/try/rcc',
    role: 'app.read',
    resourceAppId: RCC_APP_ID,
    exampleCalls: [
      { title: 'Get a court house', path: '/courthouses/{court_id}' },
      { title: 'Get a courtroom in a court house', path: '/courthouses/{court_id}/courtrooms/{court_room_id}' },
    ],
  },
};

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
  const environment = process.env.PLATFORM_ENVIRONMENT;

  beforeEach(() => {
    process.env.PLATFORM_ENVIRONMENT = 'sandbox';
    mockedScopes.mockReset();
    mockedScopes.mockResolvedValue({
      [SLC_API_NAME]: `${SLC_APP_ID}/.default`,
      [RCC_API_NAME]: `${RCC_APP_ID}/.default`,
    });
    mockedProduct.mockReset();
    mockedProduct.mockImplementation(async name => PRODUCTS[name]);
  });

  afterAll(() => {
    if (environment === undefined) {
      delete process.env.PLATFORM_ENVIRONMENT;
    } else {
      process.env.PLATFORM_ENVIRONMENT = environment;
    }
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

  test('slc_should_get_its_court_schedule_call_and_scenarios', async () => {
    const slc = (await instructionsFor(application([SLC])))[SLC_API_NAME];

    expect(slc.calls).toEqual([
      {
        title: 'Get the court schedule for a case',
        url: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/case/{case_urn}/courtschedule',
      },
    ]);
    expect(slc.placeholders).toEqual(['case_urn']);
    expect(slc.scenariosUrl).toBe('https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/scenarios');
  });

  test('rcc_should_get_both_its_calls_in_order_and_its_own_scenarios', async () => {
    const rcc = (await instructionsFor(application([RCC])))[RCC_API_NAME];

    expect(rcc.calls).toEqual([
      {
        title: 'Get a court house',
        url: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/rcc/courthouses/{court_id}',
      },
      {
        title: 'Get a courtroom in a court house',
        url: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/rcc/courthouses/{court_id}/courtrooms/{court_room_id}',
      },
    ]);
    expect(rcc.placeholders).toEqual(['court_id', 'court_room_id']);
    expect(rcc.scenariosUrl).toBe('https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/rcc/scenarios');
  });

  test.each([
    ['sandbox', 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/rcc/scenarios'],
    ['preview', 'https://sps-api-mgmt.preview.api.hmcts.net/amp/try/rcc/scenarios'],
    ['aat', 'https://sps-api-mgmt.aat.api.hmcts.net/amp/try/rcc/scenarios'],
    ['demo', 'https://sps-api-mgmt.demo.hmcts.net/amp/try/rcc/scenarios'],
  ])('in_%s_the_calls_should_go_to_its_apim_gateway', async (name, url) => {
    process.env.PLATFORM_ENVIRONMENT = name;

    expect((await instructionsFor(application([RCC])))[RCC_API_NAME].scenariosUrl).toBe(url);
  });

  test('an_environment_with_no_gateway_should_show_the_token_request_alone', async () => {
    process.env.PLATFORM_ENVIRONMENT = 'prod';
    const rcc = (await instructionsFor(application([RCC])))[RCC_API_NAME];

    expect(rcc.token.scope).toBe(`${RCC_APP_ID}/.default`);
    expect(rcc.calls).toEqual([]);
    expect(rcc.placeholders).toEqual([]);
    expect(rcc.scenariosUrl).toBeUndefined();
  });

  test('without_platform_environment_it_should_fall_back_to_config_which_deployed_environments_leave_empty', async () => {
    delete process.env.PLATFORM_ENVIRONMENT;

    // config/test.json, like default.json, names no environment: only development.json does.
    expect((await instructionsFor(application([SLC])))[SLC_API_NAME].scenariosUrl).toBeUndefined();
  });

  test('an_api_the_backend_holds_no_calls_for_should_still_get_its_scenarios', async () => {
    mockedProduct.mockResolvedValue({ ...PRODUCTS[RCC_API_NAME], exampleCalls: undefined });
    const rcc = (await instructionsFor(application([RCC])))[RCC_API_NAME];

    expect(rcc.calls).toEqual([]);
    expect(rcc.placeholders).toEqual([]);
    expect(rcc.scenariosUrl).toBe('https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/rcc/scenarios');
  });

  test('an_api_the_marketplace_does_not_hold_should_get_no_calls_or_scenarios', async () => {
    mockedProduct.mockResolvedValue(undefined);
    const rcc = (await instructionsFor(application([RCC])))[RCC_API_NAME];

    expect(rcc.calls).toEqual([]);
    expect(rcc.scenariosUrl).toBeUndefined();
  });

  test('a_marketplace_that_cannot_be_reached_should_fall_back_to_the_configured_id_for_slc_alone', async () => {
    mockedScopes.mockResolvedValue({});

    expect(await publisherId(SLC_API_NAME)).toBe(CONFIGURED_FALLBACK);
    // That configured ID is SLC's app, so no other API is shown it.
    expect(await publisherId(RCC_API_NAME)).toBe('{publisher_id}');
    expect((await instructionsFor(application([RCC])))[RCC_API_NAME].token.scope).toBe('{publisher_id}/.default');
  });
});
