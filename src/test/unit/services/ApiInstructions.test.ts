import { SLC_API_NAME, instructionsFor, slcBaseUrl } from '../../../main/services/ApiInstructions';
import { ApiSubscription, Application } from '../../../main/services/Applications';

/** The marketplace API's app registration, the resource every consumer asks Entra for a token on. */
const PUBLISHER_ID = '30288840-e345-4543-99ee-f9253d789339';
const SANDBOX_URL = 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc';
const DEMO_URL = 'https://sps-api-mgmt.sandbox.demo.hmcts.net/amp/try/slc';

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
  const environment = process.env.PLATFORM_ENVIRONMENT;

  beforeEach(() => {
    process.env.PLATFORM_ENVIRONMENT = 'sandbox';
  });

  afterAll(() => {
    if (environment === undefined) {
      delete process.env.PLATFORM_ENVIRONMENT;
    } else {
      process.env.PLATFORM_ENVIRONMENT = environment;
    }
  });

  test.each([
    ['sandbox', SANDBOX_URL],
    ['preview', 'https://sps-api-mgmt.preview.api.hmcts.net/amp/try/slc'],
    ['aat', 'https://sps-api-mgmt.aat.api.hmcts.net/amp/try/slc'],
    ['demo', DEMO_URL],
    ['somewhere-else', undefined],
  ])('the_slc_url_in_%s_should_be_%s', (name, url) => {
    process.env.PLATFORM_ENVIRONMENT = name;

    expect(slcBaseUrl()).toBe(url);
  });

  test('the_token_request_should_name_the_tenant_client_and_publisher_id_scope', () => {
    expect(instructionsFor(application([SLC])).token).toEqual({
      url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
      clientId: 'client-1',
      clientSecret: '<client_secret>',
      publisherId: PUBLISHER_ID,
      scope: `${PUBLISHER_ID}/.default`,
    });
  });

  test('the_publisher_id_should_be_the_same_whichever_apis_the_application_has', () => {
    for (const apis of [[SLC], [RCC], [RCC, SLC], []]) {
      expect(instructionsFor(application(apis)).token.scope).toBe(`${PUBLISHER_ID}/.default`);
    }
  });

  test('without_a_tenant_from_the_backend_the_request_should_keep_a_placeholder', () => {
    expect(instructionsFor(application([SLC], '')).token.url).toBe(
      'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token'
    );
  });

  test('an_application_with_slc_should_get_the_court_schedule_and_scenarios_urls', () => {
    expect(instructionsFor(application([SLC])).slc).toEqual({
      courtScheduleUrl: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/case/{case_urn}/courtschedule',
      scenariosUrl: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/scenarios',
    });
  });

  test('the_slc_instructions_should_be_left_out_without_slc_or_without_a_url_for_the_environment', () => {
    expect(instructionsFor(application([RCC])).slc).toBeUndefined();

    process.env.PLATFORM_ENVIRONMENT = 'somewhere-else';
    expect(instructionsFor(application([SLC])).slc).toBeUndefined();
  });
});
