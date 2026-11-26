import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const application = {
  name: 'test',
  owner: { id: 2, name: 'John Doe', email: 'john.doe@example.com' },
  created: '29 October 2026',
  clientId: '4759fa10-17be-4ff0-bee6-b632864d0fc2',
  apis: ['Court Schedule'],
};

const render = (extra: Record<string, unknown> = {}) =>
  env.render('admin/application.njk', { application, couldNotLoad: false, ...extra });

describe('Admin application page', () => {
  test('the_application_should_be_headed_by_name_under_an_application_caption', () => {
    const html = render();

    expect(html).toContain('<span class="govuk-caption-l">Application</span>');
    expect(html).toContain('<h1 class="govuk-heading-xl">test</h1>');
  });

  test('the_summary_should_list_every_detail_in_order', () => {
    const html = render();
    const keys = [...html.matchAll(/<dt class="govuk-summary-list__key">\s*([^<]+?)\s*<\/dt>/g)].map(m => m[1]);

    expect(keys).toEqual(['Application name', 'Owner', 'Created', 'Client ID']);
    expect(html).toContain('<a class="govuk-link" href="/admin/users/2">John Doe</a><br>john.doe@example.com');
    expect(html).toContain('4759fa10-17be-4ff0-bee6-b632864d0fc2');
  });

  test('the_page_should_say_admins_cannot_see_secrets', () => {
    expect(render()).toContain(
      "Admins cannot see an application's client secret or subscription keys. Only the application's owner can."
    );
  });

  test('the_apis_should_be_a_bulleted_list', () => {
    const html = render();

    expect(html).toContain('<h2 class="govuk-heading-l">APIs</h2>');
    expect(html).toMatch(/<ul class="govuk-list govuk-list--bullet" id="application-apis">\s*<li>Court Schedule<\/li>/);
  });

  test('an_application_with_no_apis_should_say_so', () => {
    expect(render({ application: { ...application, apis: [] } })).toContain(
      'This application does not use any APIs yet.'
    );
  });

  test('no_request_should_say_production_credentials_have_not_been_requested', () => {
    const html = render();

    expect(html).toContain('id="production-credentials-request">Production credentials request</h2>');
    expect(html).toContain('Production credentials have not been requested for this application.');
  });

  test('a_request_should_show_its_reference_status_and_date', () => {
    const html = render({
      productionRequest: { reference: 'PCR-ABCD2345', status: 'In review', submitted: '1 November 2026' },
    });

    expect(html).toContain('PCR-ABCD2345');
    expect(html).toContain('In review');
    expect(html).not.toContain('have not been requested');
  });

  test('the_breadcrumbs_should_lead_back_to_the_applications', () => {
    expect(render()).toContain('href="/admin/applications"');
  });

  test('an_unreachable_backend_should_say_the_application_could_not_be_loaded', () => {
    const html = render({ application: undefined, couldNotLoad: true });

    expect(html).toContain('This application could not be loaded just now.');
    expect(html).not.toContain('govuk-summary-list');
  });
});
