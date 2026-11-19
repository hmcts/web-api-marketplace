import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const user = {
  name: 'Grace Hopper',
  email: 'grace.hopper@hmcts.net',
  organisation: 'Not known',
  status: 'Active',
  joined: '15 October 2026',
  lastSignedIn: 'Not known',
};

const render = (extra: Record<string, unknown> = {}) =>
  env.render('admin/user.njk', { user, applications: [], productionRequests: [], couldNotLoad: false, ...extra });

describe('Admin user page', () => {
  test('the_user_should_be_headed_by_name_under_a_user_caption', () => {
    const html = render();

    expect(html).toContain('<span class="govuk-caption-l">User</span>');
    expect(html).toContain('<h1 class="govuk-heading-xl">Grace Hopper</h1>');
  });

  test('the_summary_should_list_every_detail_in_order', () => {
    const html = render();
    const keys = [...html.matchAll(/<dt class="govuk-summary-list__key">\s*([^<]+?)\s*<\/dt>/g)].map(m => m[1]);

    expect(keys).toEqual(['Name', 'Email', 'Organisation', 'Status', 'Joined', 'Last signed in']);
    expect(html).toContain('Not known');
  });

  test('a_user_with_nothing_yet_should_say_so_in_both_sections', () => {
    const html = render();

    expect(html).toContain('<h2 class="govuk-heading-l">Applications</h2>');
    expect(html).toContain('This user has not created any applications.');
    expect(html).toContain('<h2 class="govuk-heading-l">Production credentials requests</h2>');
    expect(html).toContain('This user has not asked for production credentials.');
  });

  test('applications_and_requests_should_be_tables_with_plain_application_names', () => {
    const html = render({
      applications: [{ name: 'Case Viewer', apis: '2 APIs', created: '29 October 2026' }],
      productionRequests: [
        {
          reference: 'PCR-ABCD2345',
          applicationName: 'Case Viewer',
          status: 'Submitted',
          submitted: '1 November 2026',
        },
      ],
    });

    for (const heading of ['Application', 'APIs', 'Created', 'Reference', 'Status', 'Submitted']) {
      expect(html).toContain(`>${heading}</th>`);
    }
    expect(html).toContain('2 APIs');
    expect(html).toContain('PCR-ABCD2345');
    expect(html).not.toMatch(/<a [^>]*>Case Viewer<\/a>/);
    expect(html).not.toContain('This user has not created any applications.');
  });

  test('the_breadcrumbs_should_lead_back_to_the_users', () => {
    expect(render()).toContain('href="/admin/users"');
  });

  test('an_unreachable_backend_should_say_the_user_could_not_be_loaded', () => {
    const html = render({ user: undefined, couldNotLoad: true });

    expect(html).toContain('This user could not be loaded just now.');
    expect(html).not.toContain('govuk-summary-list');
  });
});
