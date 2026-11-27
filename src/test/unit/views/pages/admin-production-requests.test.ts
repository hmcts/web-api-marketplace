import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const row = {
  reference: 'PCR-7K2MHQ4D',
  applicationId: 10,
  applicationName: 'Custody <listings> feed',
  organisation: 'Northshire Police, custody team',
  submitted: '8 September 2026',
  status: 'Submitted',
};
const statuses = [
  { value: '', text: 'All statuses', selected: true },
  { value: 'SUBMITTED', text: 'Submitted', selected: false },
];

const render = (extra: Record<string, unknown> = {}) =>
  env.render('admin/production-requests.njk', {
    status: '',
    statuses,
    count: 1,
    requests: [row],
    couldNotLoad: false,
    ...extra,
  });

describe('Admin production requests page', () => {
  test('the_page_should_explain_the_order_and_offer_a_status_filter', () => {
    const html = render();

    expect(html).toContain('<h1 class="govuk-heading-xl">Production credentials requests</h1>');
    expect(html).toContain('Every production credentials request, oldest first.');
    expect(html).toContain('<select class="govuk-select" id="status" name="status">');
    expect(html).toContain('<option value="" selected>All statuses</option>');
    expect(html).toMatch(/<button[^>]*id="requests-filter"[^>]*>\s*Filter/);
  });

  test('the_table_should_have_the_columns_from_the_design_and_count_the_requests', () => {
    const html = render();

    for (const heading of ['Reference', 'Application', 'Organisation', 'Submitted', 'Status']) {
      expect(html).toContain(`>${heading}</th>`);
    }
    expect(html).toContain('1 request.');
    expect(html).toContain(
      '<caption class="govuk-table__caption govuk-visually-hidden">Production credentials requests</caption>'
    );
  });

  test('the_reference_and_application_should_link_to_their_pages_escaped', () => {
    const html = render();

    expect(html).toContain('<a class="govuk-link" href="/admin/production-requests/PCR-7K2MHQ4D">PCR-7K2MHQ4D</a>');
    expect(html).toContain('<a class="govuk-link" href="/admin/applications/10">Custody &lt;listings&gt; feed</a>');
  });

  test('a_request_whose_application_is_gone_should_name_it_without_a_link', () => {
    const html = render({ requests: [{ ...row, applicationId: undefined, applicationName: 'Custody listings feed' }] });

    expect(html).not.toContain('href="/admin/applications/');
    expect(html).toContain('<td class="govuk-table__cell">Custody listings feed</td>');
  });

  test('no_requests_should_count_zero_without_a_table', () => {
    const html = render({ count: 0, requests: [] });

    expect(html).toContain('0 requests.');
    expect(html).not.toContain('requests-table');
  });

  test('an_unreachable_backend_should_say_the_requests_could_not_be_loaded', () => {
    const html = render({ couldNotLoad: true });

    expect(html).toContain('The production credentials requests could not be loaded just now.');
    expect(html).not.toContain('requests-table');
  });
});
