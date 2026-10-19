import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/account.json');

const user = { id: 1, name: 'Joe Bloggs', email: 'joe@example.com' };

describe('Account page', () => {
  test('rendering_the_page_should_show_no_tabs_and_no_list_of_requests', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).not.toContain('tab-requests');
    expect(html).not.toContain('My requests');
    expect(html).not.toContain('/account/delete-request');
  });

  test('rendering_the_page_should_show_the_signed_in_details', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('Joe Bloggs');
    expect(html).toContain(user.email);
    expect(html).not.toContain('Organisation');
  });

  test('the_account_page_should_list_the_next_steps_in_journey_order', () => {
    const html = env.render('account.njk', { ...i18n, user });
    const steps = html.slice(html.indexOf('Next steps'), html.indexOf('</ol>', html.indexOf('Next steps')));

    expect(steps.indexOf('href="/api-catalogue"')).toBeGreaterThan(-1);
    expect(steps.indexOf('href="/account/applications/new"')).toBeGreaterThan(steps.indexOf('href="/api-catalogue"'));
    expect(steps.indexOf('href="/account/applications"')).toBeGreaterThan(steps.indexOf('Try it now credentials'));
    expect(steps).toContain('request production credentials for it');
  });

  test('the_production_step_should_send_the_user_to_their_applications_not_straight_to_the_form', () => {
    const html = env.render('account.njk', { ...i18n, user });
    const steps = html.slice(html.indexOf('Next steps'), html.indexOf('</ol>', html.indexOf('Next steps')));

    expect(steps).not.toContain('href="/account/production-credentials"');
  });

  test('signing_out_should_be_a_post_so_no_link_can_trigger_it', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('<form method="post" action="/sign-out">');
  });
});
