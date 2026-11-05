import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const GATEWAY = 'https://sps-api-mgmt.sandbox.api.hmcts.net';
const RCC = 'api-cp-refdata-courthearing-courthouses';
const SLC = 'api-cp-crime-schedulingandlisting-courtschedule';

const token = (publisherId: string) => ({
  url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
  clientId: 'client-1',
  clientSecret: '<client_secret>',
  publisherId,
  scope: `${publisherId}/.default`,
});

const rcc = {
  apiName: RCC,
  apiTitle: 'Refdata Court Hearing Courthouses',
  token: token('97c20454-55c1-45b0-88cd-268db572f615'),
  calls: [
    { title: 'Get a court house', url: `${GATEWAY}/amp/try/rcc/courthouses/{court_id}` },
    {
      title: 'Get a courtroom in a court house',
      url: `${GATEWAY}/amp/try/rcc/courthouses/{court_id}/courtrooms/{court_room_id}`,
    },
  ],
  placeholders: ['court_id', 'court_room_id'],
  scenariosUrl: `${GATEWAY}/amp/try/rcc/scenarios`,
};

const slc = {
  apiName: SLC,
  apiTitle: 'Scheduling and Listing Court Schedule',
  token: token('c4c8974c-2800-4fe6-964f-dcd4c0820507'),
  calls: [{ title: 'Get the court schedule for a case', url: `${GATEWAY}/amp/try/slc/case/{case_urn}/courtschedule` }],
  placeholders: ['case_urn'],
  scenariosUrl: `${GATEWAY}/amp/try/slc/scenarios`,
};

/** The text of the code block with this id. */
const block = (html: string, id: string) => new RegExp(`id="${id}"><code>([\\s\\S]*?)</code>`).exec(html)?.[1] ?? '';

const call = (url: string) =>
  [
    'curl --request GET \\',
    `  --url ${url} \\`,
    "  --header 'Accept: application/json' \\",
    "  --header 'Authorization: Bearer &lt;token&gt;' \\",
    "  --header 'Ocp-Apim-Subscription-Key: &lt;apim_subscription_key&gt;'",
  ].join('\n');

const scenarios = (url: string) =>
  [
    'curl --request GET \\',
    `  --url ${url} \\`,
    "  --header 'Accept: application/json' \\",
    "  --header 'Ocp-Apim-Subscription-Key: &lt;apim_subscription_key&gt;'",
  ].join('\n');

describe('Application instructions', () => {
  const render = (i: Record<string, unknown>) => env.render('applications/instructions.njk', { i });

  test('the_publisher_id_should_be_the_apis_own_and_come_first_above_the_token_request', () => {
    const html = render(rcc);
    const publisherId = html.indexOf(`id="publisher-id-${RCC}">97c20454-55c1-45b0-88cd-268db572f615<`);

    expect(html.indexOf('Publisher ID (scope)')).toBeGreaterThan(-1);
    expect(publisherId).toBeGreaterThan(-1);
    expect(publisherId).toBeLessThan(html.indexOf('Get an access token'));
  });

  test('the_token_request_should_be_a_curl_command_with_the_apis_own_scope', () => {
    expect(block(render(rcc), `token-request-${RCC}`)).toBe(
      [
        'curl --request POST \\',
        '  --url https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token \\',
        "  --header 'Content-Type: application/x-www-form-urlencoded' \\",
        '  --data grant_type=client_credentials \\',
        '  --data client_id=client-1 \\',
        "  --data 'client_secret=<client_secret>' \\",
        '  --data scope=97c20454-55c1-45b0-88cd-268db572f615/.default',
      ].join('\n')
    );
  });

  test('rcc_should_show_both_its_calls_each_under_its_own_heading_in_order', () => {
    const html = render(rcc);
    const courthouse = html.indexOf('>Get a court house</h3>');
    const courtroom = html.indexOf('>Get a courtroom in a court house</h3>');

    expect(courthouse).toBeGreaterThan(html.indexOf(`id="token-request-${RCC}"`));
    expect(courtroom).toBeGreaterThan(courthouse);
    expect(block(html, `call-request-${RCC}-1`)).toBe(call(`${GATEWAY}/amp/try/rcc/courthouses/{court_id}`));
    expect(block(html, `call-request-${RCC}-2`)).toBe(
      call(`${GATEWAY}/amp/try/rcc/courthouses/{court_id}/courtrooms/{court_room_id}`)
    );
  });

  test('rcc_should_show_its_own_scenarios_for_the_values_both_calls_need', () => {
    const html = render(rcc);

    expect(html).toContain('>Find a court_id and court_room_id to try</h3>');
    expect(html).toContain('to get values to use in the requests above');
    expect(block(html, `scenarios-request-${RCC}`)).toBe(scenarios(`${GATEWAY}/amp/try/rcc/scenarios`));
  });

  test('slc_should_show_its_court_schedule_call_and_scenarios', () => {
    const html = render(slc);

    expect(html).toContain('>Get the court schedule for a case</h3>');
    expect(block(html, `call-request-${SLC}-1`)).toBe(call(`${GATEWAY}/amp/try/slc/case/{case_urn}/courtschedule`));
    expect(html).toContain('>Find a case_urn to try</h3>');
    expect(html).toContain('to get a case_urn to use in the request above');
    expect(block(html, `scenarios-request-${SLC}`)).toBe(scenarios(`${GATEWAY}/amp/try/slc/scenarios`));
  });

  test('with_scenarios_but_no_calls_held_the_scenarios_should_still_show', () => {
    const html = render({ ...rcc, calls: [], placeholders: [] });

    expect(html).not.toContain(`id="call-request-${RCC}-1"`);
    expect(html).toContain('>Try the test scenarios</h3>');
    expect(block(html, `scenarios-request-${RCC}`)).toBe(scenarios(`${GATEWAY}/amp/try/rcc/scenarios`));
  });

  test('without_a_gateway_only_the_token_request_should_show', () => {
    const html = render({ ...rcc, calls: [], placeholders: [], scenariosUrl: undefined });

    expect(html).toContain(`id="token-request-${RCC}"`);
    expect(html).not.toContain('call-request-');
    expect(html).not.toContain('scenarios-request-');
  });

  test('the_requests_should_stand_without_lists_explaining_their_parameters', () => {
    const html = render(slc);

    expect(html).not.toContain('<ul');
    expect(html).not.toContain('is this application');
    expect(html).not.toContain('The access_token in the response');
    expect(html).not.toContain('is the unique reference number of the case');
  });
});
