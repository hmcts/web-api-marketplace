import { SLC_API_NAME, instructionsFor, slcBaseUrl } from '../../../main/services/ApiInstructions';
import { ApiSubscription, Application } from '../../../main/services/Applications';

const SANDBOX_URL = 'https://amp-try-slc.sandbox.platform.hmcts.net';

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
    ['prod', undefined],
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
      scope: 'cp-crime-schedulingandlisting/.default',
      publishers: [{ apiTitle: SLC.apiTitle, publisherId: 'cp-crime-schedulingandlisting' }],
    });
  });

  test('the_example_scope_should_be_the_slc_one_when_there_are_several', () => {
    const { token } = instructionsFor(application([RCC, SLC]));

    expect(token.scope).toBe('cp-crime-schedulingandlisting/.default');
    expect(token.publishers.map(publisher => publisher.publisherId)).toEqual([
      'cp-refdata-courthearing-courthouses',
      'cp-crime-schedulingandlisting',
    ]);
  });

  test('without_a_tenant_from_the_backend_or_any_api_the_request_should_keep_placeholders', () => {
    const { token } = instructionsFor(application([], ''));

    expect(token.url).toBe('https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token');
    expect(token.scope).toBe('<publisher_id>/.default');
  });

  test('an_application_with_slc_should_get_the_court_schedule_and_scenarios_urls', () => {
    expect(instructionsFor(application([SLC])).slc).toEqual({
      courtScheduleUrl: `${SANDBOX_URL}/amp/slc/case/<case_urn>/courtschedule`,
      scenariosUrl: `${SANDBOX_URL}/amp/slc/scenarios`,
    });
  });

  test('the_slc_instructions_should_be_left_out_without_slc_or_without_a_url_for_the_environment', () => {
    expect(instructionsFor(application([RCC])).slc).toBeUndefined();

    process.env.PLATFORM_ENVIRONMENT = 'prod';
    expect(instructionsFor(application([SLC])).slc).toBeUndefined();
  });
});
