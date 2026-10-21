import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const token = {
  url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
  clientId: 'client-1',
  clientSecret: '<client_secret>',
  scope: 'cp-crime-schedulingandlisting/.default',
  publishers: [],
};

/** The text of the code block with this id. */
const block = (html: string, id: string) => new RegExp(`id="${id}"><code>([\\s\\S]*?)</code>`).exec(html)?.[1] ?? '';

const slc = {
  courtScheduleUrl: 'https://amp-try-slc.sandbox.platform.hmcts.net/amp/slc/case/<case_urn>/courtschedule',
  scenariosUrl: 'https://amp-try-slc.sandbox.platform.hmcts.net/amp/slc/scenarios',
};

describe('Application instructions', () => {
  const render = (context: Record<string, unknown>) => env.render('applications/instructions.njk', context);

  test('the_token_request_should_show_the_client_credentials_grant_with_the_known_values', () => {
    const html = render({ token });

    expect(block(html, 'token-request')).toBe(`POST ${token.url}\nContent-Type: application/x-www-form-urlencoded`);
    expect(block(html, 'token-request-body')).toBe(
      'grant_type=client_credentials\nclient_id=client-1\nclient_secret=<client_secret>\nscope=cp-crime-schedulingandlisting/.default'
    );
  });

  test('the_request_body_should_have_its_own_heading_between_the_request_and_the_body', () => {
    const html = render({ token });

    const heading = html.indexOf('>Request body</h4>');
    expect(heading).toBeGreaterThan(html.indexOf('id="token-request"'));
    expect(heading).toBeLessThan(html.indexOf('id="token-request-body"'));
  });

  test('with_slc_it_should_show_how_to_call_it_and_where_to_find_a_case_urn', () => {
    const html = render({ token, slc });

    expect(html).toContain(`GET ${slc.courtScheduleUrl}`);
    expect(html).toContain('Authorization: Bearer &lt;token&gt;');
    expect(html).toContain(`GET ${slc.scenariosUrl}`);
    expect(html.match(/Accept: application\/json/g)).toHaveLength(2);
  });

  test('without_slc_only_the_token_request_should_show', () => {
    const html = render({ token });

    expect(html).not.toContain('id="slc-request"');
    expect(html).not.toContain('id="scenarios-request"');
  });

  test('the_explanations_should_read_as_body_text_with_only_the_requests_in_code', () => {
    const html = render({ token, slc });
    const outsideRequests = html.replace(/<pre[\s\S]*?<\/pre>/g, '');

    expect(outsideRequests).not.toContain('<code>');
    expect(outsideRequests).toContain("<li>client_id is this application's client ID</li>");
    expect(outsideRequests).toContain('<li>&lt;case_urn&gt; is the unique reference number of the case</li>');
    expect(outsideRequests).toContain(
      '<p class="govuk-body">The access_token in the response is the token you send with each call.</p>'
    );
  });
});
