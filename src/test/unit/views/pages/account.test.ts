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

  test('each_listed_request_should_offer_a_delete_that_posts_its_reference_and_type', () => {
    const myRequests = [
      { reference: 'AR-2026-IPCOC1', type: 'SUBSCRIPTION', submittedOn: '3 September 2026', status: 'NEW' },
      { reference: 'PR-2026-E9PDKA', type: 'PUBLISH', submittedOn: '2 September 2026', status: 'NEW' },
    ];

    const html = env.render('account.njk', { ...i18n, user, myRequests });

    expect(html).toContain('<form method="post" action="/account/delete-request"');
    expect(html).toContain('name="reference" value="AR-2026-IPCOC1"');
    expect(html).toContain('name="type" value="SUBSCRIPTION"');
    expect(html).toContain('name="reference" value="PR-2026-E9PDKA"');
    expect(html).toContain('name="type" value="PUBLISH"');
    expect(html).toContain('id="delete-1"');
    expect(html).toContain('id="delete-2"');
  });

  test('a_delete_button_should_name_the_reference_for_a_screen_reader', () => {
    const myRequests = [
      { reference: 'AR-2026-IPCOC1', type: 'SUBSCRIPTION', submittedOn: '3 September 2026', status: 'NEW' },
    ];

    const html = env.render('account.njk', { ...i18n, user, myRequests });

    // "Delete" alone is the same label on every row, so the reference goes with it.
    expect(html).toContain('<span class="govuk-visually-hidden"> AR-2026-IPCOC1</span>');
  });

  test('a_page_with_no_requests_should_offer_nothing_to_delete', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).not.toContain('/account/delete-request');
  });

  test('a_deleted_request_should_be_confirmed_in_a_banner', () => {
    const html = env.render('account.njk', { ...i18n, user, deleted: true });

    expect(html).toContain('id="request-deleted"');
    expect(html).toContain(i18n.requests.deleted);
    expect(html).not.toContain('id="request-delete-failed"');
  });

  test('a_failed_delete_should_be_reported_rather_than_passing_silently', () => {
    const html = env.render('account.njk', { ...i18n, user, deleteFailed: true });

    expect(html).toContain('id="request-delete-failed"');
    expect(html).toContain(i18n.requests.deleteFailed);
    expect(html).not.toContain('id="request-deleted"');
  });

  test('an_ordinary_visit_should_show_no_banner_at_all', () => {
    const html = env.render('account.njk', { ...i18n, user });

    expect(html).not.toContain('govuk-notification-banner');
  });
});
