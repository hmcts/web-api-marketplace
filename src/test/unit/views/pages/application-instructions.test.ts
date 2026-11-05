import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const RCC = 'api-cp-refdata-courthearing-courthouses';

const rcc = {
  apiName: RCC,
  apiTitle: 'Refdata Court Hearing Courthouses',
  token: {
    url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
    clientId: 'client-1',
    clientSecret: '<client_secret>',
    publisherId: '97c20454-55c1-45b0-88cd-268db572f615',
    scope: '97c20454-55c1-45b0-88cd-268db572f615/.default',
  },
  docsUrl: `https://hmcts.github.io/${RCC}/`,
};

/** The text of the code block with this id. */
const block = (html: string, id: string) => new RegExp(`id="${id}"><code>([\\s\\S]*?)</code>`).exec(html)?.[1] ?? '';

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

  test('the_token_request_should_be_the_only_curl_command', () => {
    const html = render(rcc);

    expect(html.match(/<pre/g)).toHaveLength(1);
    expect(html).not.toContain('curl --request GET');
  });

  test('the_developer_portal_should_be_a_link_named_after_the_api_opening_in_a_new_tab_after_the_token_request', () => {
    const html = render(rcc);
    const link = new RegExp(`<a [^>]*id="api-reference-${RCC}"[^>]*>([^<]*)</a>`).exec(html);

    expect(html).toContain('>Run try it now in developer portal</h3>');
    expect(link?.[0]).toContain(`href="https://hmcts.github.io/${RCC}/"`);
    expect(link?.[0]).toContain('target="_blank"');
    expect(link?.[0]).toContain('rel="noreferrer noopener"');
    expect(link?.[1]).toBe('Refdata Court Hearing Courthouses API reference (opens in new tab)');
    expect(html.indexOf(`id="api-reference-${RCC}"`)).toBeGreaterThan(html.indexOf(`id="token-request-${RCC}"`));
  });

  test('the_developer_portal_link_should_stand_alone_without_header_guidance', () => {
    const html = render(rcc);

    expect(html).not.toContain('Call the API');
    expect(html).not.toContain('Ocp-Apim-Subscription-Key');
    expect(html).not.toContain('Authorization: Bearer');
  });

  test('the_requests_should_stand_without_lists_explaining_their_parameters', () => {
    const html = render(rcc);

    expect(html).not.toContain('<ul');
    expect(html).not.toContain('is this application');
    expect(html).not.toContain('The access_token in the response');
  });
});
