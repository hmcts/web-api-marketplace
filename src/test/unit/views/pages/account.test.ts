import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/account.json');

const user = { id: 1, name: 'Joe Bloggs', email: 'joe@example.com' };

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
    expect(html).not.toContain('Organisation');
  });

  test('the_account_tab_should_list_the_next_steps_in_journey_order', () => {
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

  test('the_requests_tab_should_say_there_are_none_yet_and_point_at_the_applications', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('You have not submitted any requests yet');
    expect(html).toContain('request production credentials, open the application you have tested');
    expect(html).not.toContain('href="/subscribe"');
    expect(html).not.toContain('href="/publish"');
  });

  test('signing_out_should_be_a_post_so_no_link_can_trigger_it', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).toContain('<form method="post" action="/sign-out">');
  });

  test('submitted_requests_of_both_kinds_should_be_listed_in_one_table', () => {
    const myRequests = [
      {
        reference: 'AR-2026-IPCOC1',
        type: 'SUBSCRIPTION',
        submittedOn: '3 September 2026',
        status: 'NEW',
      },
      {
        reference: 'PR-2026-E9PDKA',
        type: 'PUBLISH',
        submittedOn: '2 September 2026',
        status: 'NEW',
      },
    ];

    const html = env.render('account.njk', { ...i18n, user, myRequests });

    expect(html).toContain('AR-2026-IPCOC1');
    expect(html).toContain('PR-2026-E9PDKA');
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

  test('a_listed_request_should_have_no_delete_button_and_the_table_no_action_column', () => {
    const myRequests = [
      { reference: 'PCR-2026-IPCOC1', type: 'PRODUCTION', submittedOn: '3 September 2026', status: 'Submitted' },
    ];

    const html = env.render('account.njk', { ...i18n, user, myRequests });

    expect(html).toContain('PCR-2026-IPCOC1');
    expect(html).not.toContain('/account/delete-request');
    expect(html).not.toContain('govuk-button--warning');
    expect(html).not.toContain('>Action<');
  });
});
