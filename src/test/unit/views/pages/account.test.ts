import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/account.json');

const user = { id: 1, firstName: 'Joe', lastName: 'Bloggs', email: 'joe@example.com', orgName: 'HMCTS DTS' };

describe('Account page', () => {
  test('rendering_the_page_should_show_both_tabs', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('id="tab-account"');
    expect(html).toContain('id="tab-requests"');
    expect(html).toContain(i18n.requests.tabLabel);
  });

  test('rendering_the_page_should_show_the_signed_in_details_on_the_account_tab', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('Joe Bloggs');
    expect(html).toContain(user.email);
    expect(html).toContain(user.orgName);
  });

  test('the_requests_tab_should_say_there_are_none_yet_and_point_at_both_journeys', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('You have not submitted any requests yet');
    expect(html).toContain('href="/subscribe"');
    expect(html).toContain('href="/publish"');
  });

  test('signing_out_should_be_a_post_so_no_link_can_trigger_it', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('<form method="post" action="/sign-out">');
  });

  test('submitted_requests_of_both_kinds_should_be_listed_in_one_table', () => {
    const myRequests = [
      {
        reference: 'e6a1c0de-0000-4000-8000-000000000001',
        type: 'SUBSCRIPTION',
        submittedOn: '3 September 2026',
        status: 'NEW',
      },
      {
        reference: 'b2c3d4e5-0000-4000-8000-000000000002',
        type: 'PUBLISH',
        submittedOn: '2 September 2026',
        status: 'NEW',
      },
    ];

    const html = env.render('account.njk', { ...i18n, user, myRequests });

    expect(html).toContain('e6a1c0de-0000-4000-8000-000000000001');
    expect(html).toContain('b2c3d4e5-0000-4000-8000-000000000002');
    expect(html).toContain(i18n.requests.types.SUBSCRIPTION);
    expect(html).toContain(i18n.requests.types.PUBLISH);
    expect(html).toContain('3 September 2026');
    expect(html).not.toContain('You have not submitted any requests yet');
  });

  test('an_unrecognised_type_should_show_its_code_rather_than_nothing', () => {
    const myRequests = [{ reference: 'a', type: 'SUPPORT', submittedOn: '3 September 2026', status: 'NEW' }];

    const html = env.render('account.njk', { ...i18n, user, myRequests });

    expect(html).toContain('SUPPORT');
  });

  test('a_failed_lookup_should_say_so_rather_than_claim_there_are_none', () => {
    const html = env.render('account.njk', { ...i18n, user, couldNotLoad: true });

    expect(html).toContain(i18n.requests.unavailable);
    expect(html).not.toContain('You have not submitted any requests yet');
  });
});
