import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const row = {
  id: 10,
  name: 'Case <Viewer>',
  owner: { id: 2, name: 'Grace Hopper', email: 'grace.hopper@hmcts.net' },
  apis: '2 APIs',
  created: '29 October 2026',
  productionRequested: false,
};

const render = (extra: Record<string, unknown> = {}) =>
  env.render('admin/applications.njk', { count: 1, applications: [row], couldNotLoad: false, ...extra });

describe('Admin applications page', () => {
  test('the_table_should_have_the_columns_from_the_design_and_a_caption', () => {
    const html = render();

    for (const heading of ['Application', 'Owner', 'APIs', 'Created', 'Production credentials']) {
      expect(html).toContain(`>${heading}</th>`);
    }
    expect(html).toContain('<caption class="govuk-table__caption govuk-visually-hidden">Applications</caption>');
  });

  test('the_application_and_owner_should_link_to_their_pages_escaped', () => {
    const html = render();

    expect(html).toContain('<a class="govuk-link" href="/admin/applications/10">Case &lt;Viewer&gt;</a>');
    expect(html).toContain('<a class="govuk-link" href="/admin/users/2">Grace Hopper</a>');
    expect(html).toContain('Not requested');
  });

  test('a_requested_application_should_link_to_its_request', () => {
    const html = render({ applications: [{ ...row, productionRequested: true }] });

    expect(html).toContain('href="/admin/applications/10#production-credentials-request">Requested');
    expect(html).not.toContain('Not requested');
  });

  test('an_application_with_no_owner_should_say_not_known', () => {
    const html = render({ applications: [{ ...row, owner: undefined }] });

    expect(html).toContain('Not known');
    expect(html).not.toContain('href="/admin/users/');
  });

  test('no_applications_should_say_so', () => {
    expect(render({ count: 0, applications: [] })).toContain('No applications have been created yet.');
  });

  test('an_unreachable_backend_should_say_the_applications_could_not_be_loaded', () => {
    const html = render({ couldNotLoad: true });

    expect(html).toContain('The applications could not be loaded just now.');
    expect(html).not.toContain('applications-table');
  });
});
