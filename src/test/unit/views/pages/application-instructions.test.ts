import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const token = {
  url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
  clientId: 'client-1',
  clientSecret: '<client_secret>',
  publisherId: '30288840-e345-4543-99ee-f9253d789339',
  scope: '30288840-e345-4543-99ee-f9253d789339/.default',
};

/** The text of the code block with this id. */
const block = (html: string, id: string) => new RegExp(`id="${id}"><code>([\\s\\S]*?)</code>`).exec(html)?.[1] ?? '';

const slc = {
  courtScheduleUrl: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/case/{case_urn}/courtschedule',
  scenariosUrl: 'https://sps-api-mgmt.sandbox.api.hmcts.net/amp/try/slc/scenarios',
};

describe('Application instructions', () => {
  const render = (context: Record<string, unknown>) => env.render('applications/instructions.njk', context);

  test('the_publisher_id_should_come_first_above_the_token_request', () => {
    const html = render({ token });
    const publisherId = html.indexOf('id="publisher-id">30288840-e345-4543-99ee-f9253d789339<');

    expect(html.indexOf('Publisher ID (scope)')).toBeGreaterThan(-1);
    expect(publisherId).toBeGreaterThan(-1);
    expect(publisherId).toBeLessThan(html.indexOf('Get an access token'));
  });

  test('the_token_request_should_be_a_curl_command_with_the_known_values', () => {
    const html = render({ token });

    expect(block(html, 'token-request')).toBe(
      [
        'curl --request POST \\',
        `  --url ${token.url} \\`,
        "  --header 'Content-Type: application/x-www-form-urlencoded' \\",
        '  --data grant_type=client_credentials \\',
        '  --data client_id=client-1 \\',
        "  --data 'client_secret=<client_secret>' \\",
        '  --data scope=30288840-e345-4543-99ee-f9253d789339/.default',
      ].join('\n')
    );
    expect(html).not.toContain('Request body');
  });

  test('with_slc_the_call_and_the_scenarios_should_be_curl_commands_too', () => {
    const html = render({ token, slc });

    expect(block(html, 'slc-request')).toBe(
      [
        'curl --request GET \\',
        `  --url ${slc.courtScheduleUrl} \\`,
        "  --header 'Accept: application/json' \\",
        "  --header 'Authorization: Bearer &lt;token&gt;'",
      ].join('\n')
    );
    expect(block(html, 'scenarios-request')).toBe(
      ['curl --request GET \\', `  --url ${slc.scenariosUrl} \\`, "  --header 'Accept: application/json'"].join('\n')
    );
  });

  test('without_slc_only_the_token_request_should_show', () => {
    const html = render({ token });

    expect(html).not.toContain('id="slc-request"');
    expect(html).not.toContain('id="scenarios-request"');
  });

  test('the_requests_should_stand_without_lists_explaining_their_parameters', () => {
    const html = render({ token, slc });

    expect(html).not.toContain('<ul');
    expect(html).not.toContain('is this application');
    expect(html).not.toContain('The access_token in the response');
    expect(html).not.toContain('is the unique reference number of the case');
  });
});
