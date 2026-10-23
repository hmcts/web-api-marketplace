import { tokenScopes } from '../../../main/services/ApiCatalogue';
import { SLC_API_NAME, instructionsFor, slcBaseUrl } from '../../../main/services/ApiInstructions';
import { ApiSubscription, Application } from '../../../main/services/Applications';

jest.mock('../../../main/services/ApiCatalogue');

const mockedScopes = tokenScopes as jest.MockedFunction<typeof tokenScopes>;

/** SLC's own Entra resource application, which the marketplace holds against the API. */
const RESOURCE_APP_ID = 'c4c8974c-2800-4fe6-964f-dcd4c0820507';
/** Stood in only when the marketplace cannot be reached. */
const CONFIGURED_FALLBACK = '30288840-e345-4543-99ee-f9253d789339';
const SANDBOX_URL = 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc';

const subscription = (apiName: string, publisherId: string): ApiSubscription => ({
  apiName,
  apiTitle: `${apiName} title`,
  publisherId,
  subscriptionName: `amp-temp-${publisherId}`,
  subscribedAt: '2026-10-15T12:00:00',
});

const SLC = subscription(SLC_API_NAME, 'cp-crime-schedulingandlisting');
const RCC = subscription('api-cp-refdata-courthearing-courthouses', 'cp-refdata-courthearing-courthouses');

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
  const configured = process.env.SLC_BASE_URL;

  beforeEach(() => {
    process.env.SLC_BASE_URL = SANDBOX_URL;
    mockedScopes.mockReset();
    mockedScopes.mockResolvedValue({ [SLC_API_NAME]: `${RESOURCE_APP_ID}/.default` });
  });

  afterAll(() => {
    if (configured === undefined) {
      delete process.env.SLC_BASE_URL;
    } else {
      process.env.SLC_BASE_URL = configured;
    }
  });

  test('the_slc_url_should_be_the_one_this_environment_sets_in_slc_base_url', () => {
    process.env.SLC_BASE_URL = 'https://sps-api-mgmt.aat.api.hmcts.net/amp/try/slc';

    expect(slcBaseUrl()).toBe('https://sps-api-mgmt.aat.api.hmcts.net/amp/try/slc');
  });

  test('without_slc_base_url_it_should_fall_back_to_config_which_deployed_environments_leave_empty', () => {
    delete process.env.SLC_BASE_URL;

    // config/test.json, like default.json, has no address: only development.json has one.
    expect(slcBaseUrl()).toBeUndefined();
  });

  test('an_empty_slc_base_url_should_mean_no_address', () => {
    process.env.SLC_BASE_URL = '';

    expect(slcBaseUrl()).toBeUndefined();
  });

  test('the_token_request_should_name_the_tenant_client_and_the_apis_own_resource_app', async () => {
    expect((await instructionsFor(application([SLC]))).token).toEqual({
      url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
      clientId: 'client-1',
      clientSecret: '<client_secret>',
      publisherId: RESOURCE_APP_ID,
      scope: `${RESOURCE_APP_ID}/.default`,
    });
  });

  test('a_marketplace_that_cannot_be_reached_should_fall_back_to_the_configured_resource_app', async () => {
    mockedScopes.mockResolvedValue({});

    expect((await instructionsFor(application([SLC]))).token.scope).toBe(`${CONFIGURED_FALLBACK}/.default`);
  });

  test('the_scope_should_be_the_one_the_instructions_are_for_whichever_apis_the_application_has', async () => {
    for (const apis of [[SLC], [RCC], [RCC, SLC], []]) {
      expect((await instructionsFor(application(apis))).token.scope).toBe(`${RESOURCE_APP_ID}/.default`);
    }
  });

  test('without_a_tenant_from_the_backend_the_request_should_keep_a_placeholder', async () => {
    expect((await instructionsFor(application([SLC], ''))).token.url).toBe(
      'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token'
    );
  });

  test('an_application_with_slc_should_get_the_court_schedule_and_scenarios_urls', async () => {
    expect((await instructionsFor(application([SLC]))).slc).toEqual({
      courtScheduleUrl: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/case/{case_urn}/courtschedule',
      scenariosUrl: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/scenarios',
    });
  });

  test('the_slc_instructions_should_be_left_out_without_slc_or_without_a_url_for_the_environment', async () => {
    expect((await instructionsFor(application([RCC]))).slc).toBeUndefined();

    delete process.env.SLC_BASE_URL;
    expect((await instructionsFor(application([SLC]))).slc).toBeUndefined();
  });
});
