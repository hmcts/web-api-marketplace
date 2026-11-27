import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const request = {
  reference: 'PCR-7K2MHQ4D',
  status: 'Submitted',
  submitted: '8 September 2026',
  requester: { id: 5, name: 'Priya Shah', email: 'priya.shah@example.com' },
  organisation: 'Northshire Police, custody team',
  applicationId: 10,
  applicationName: 'Custody listings feed',
  apis: 'Court Schedule, Courthouse Reference Data',
};
const answers = [
  { key: 'Go-live date', value: '1 December 2026' },
  { key: 'Expected call volume', value: 'Medium' },
  { key: 'Data request', value: 'Daily hearing lists' },
  { key: 'Proposed outputs', value: 'A morning production list' },
];

const render = (extra: Record<string, unknown> = {}) =>
  env.render('admin/production-request.njk', { request, answers, couldNotLoad: false, ...extra });

const keysIn = (html: string, id: string) => {
  const section = html.slice(html.indexOf(`id="${id}"`));
  const list = section.slice(0, section.indexOf('</dl>'));
  return [...list.matchAll(/<dt class="govuk-summary-list__key">\s*([^<]+?)\s*<\/dt>/g)].map(m => m[1]);
};

describe('Admin production request page', () => {
  test('the_request_should_be_headed_by_reference_with_its_status_and_date', () => {
    const html = render();

    expect(html).toContain('<span class="govuk-caption-l">Production credentials request</span>');
    expect(html).toContain('<h1 class="govuk-heading-xl">PCR-7K2MHQ4D</h1>');
    expect(html).toMatch(/Status: <strong class="govuk-tag govuk-tag--blue"\s+id="request-status">\s*Submitted/);
    expect(html).toContain('Submitted 8 September 2026');
  });

  test('who_asked_should_list_the_requester_organisation_application_and_apis', () => {
    const html = render();

    expect(html).toContain('<h2 class="govuk-heading-m">Who asked</h2>');
    expect(keysIn(html, 'request-who-asked')).toEqual([
      'Requested by',
      'Organisation or team name',
      'Application',
      'APIs',
    ]);
    expect(html).toContain('<a class="govuk-link" href="/admin/users/5">Priya Shah</a><br>priya.shah@example.com');
    expect(html).toContain('<a class="govuk-link" href="/admin/applications/10">Custody listings feed</a>');
    expect(html).toContain('Court Schedule, Courthouse Reference Data');
  });

  test('an_organisation_type_should_be_listed_when_given', () => {
    const html = render({ request: { ...request, organisationType: 'HMCTS' } });

    expect(keysIn(html, 'request-who-asked')).toContain('Organisation');
  });

  test('their_answers_should_list_every_answer_in_order', () => {
    const html = render();

    expect(html).toContain('<h2 class="govuk-heading-m">Their answers</h2>');
    expect(keysIn(html, 'request-answers')).toEqual([
      'Go-live date',
      'Expected call volume',
      'Data request',
      'Proposed outputs',
    ]);
  });

  test('a_requester_or_application_that_is_gone_should_read_without_links', () => {
    const html = render({ request: { ...request, requester: undefined, applicationId: undefined } });

    expect(html).toContain('Not known');
    expect(html).not.toContain('href="/admin/users/');
    expect(html).not.toContain('href="/admin/applications/10"');
    expect(html).toContain('Custody listings feed');
  });

  test('the_breadcrumbs_should_lead_back_to_the_requests', () => {
    expect(render()).toContain('href="/admin/production-requests"');
  });

  test('an_unreachable_backend_should_say_the_request_could_not_be_loaded', () => {
    const html = render({ request: undefined, couldNotLoad: true });

    expect(html).toContain('This production credentials request could not be loaded just now.');
    expect(html).not.toContain('govuk-summary-list');
  });
});
