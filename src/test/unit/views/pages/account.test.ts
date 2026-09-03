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
});
