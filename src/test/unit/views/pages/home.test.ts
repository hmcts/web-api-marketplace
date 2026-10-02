import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const welshI18n = require('../../../../main/locales/cy/home.json');
const i18n = require('../../../../main/locales/en/home.json');

describe('Home page', () => {
  test('rendering_the_home_page_should_show_the_heading_and_lede', () => {
    const html = env.render('home.njk', i18n);

    expect(html).toContain(i18n.pageTitle);
    expect(html).toContain(i18n.heading);
    expect(html).toContain(i18n.lede);
  });

  test('rendering_the_home_page_should_link_every_migrated_section', () => {
    const html = env.render('home.njk', i18n);

    for (const card of i18n.cardRows.flat()) {
      expect(html).toContain(card.heading);
      expect(html).toContain(`href="${card.href}"`);
    }
  });

  test('rendering_the_home_page_for_a_signed_out_visitor_should_offer_sign_in_and_registration', () => {
    const html = env.render('home.njk', i18n);

    expect(html).toContain(i18n.signInButton);
    expect(html).toContain('href="/register"');
    expect(html).not.toContain(i18n.signedInHeading);
  });

  test('rendering_the_home_page_for_a_signed_in_user_should_offer_their_account_instead', () => {
    const html = env.render('home.njk', { ...i18n, user: { email: 'joe@example.com' } });

    expect(html).toContain(i18n.accountButton);
    expect(html).not.toContain(i18n.signInButton);
    for (const link of i18n.signedInLinks) {
      expect(html).toContain(`href="${link.href}"`);
    }
  });

  test('rendering_the_home_page_should_not_show_a_back_link', () => {
    const html = env.render('home.njk', i18n);

    expect(html).not.toContain('govuk-back-link');
  });

  test('rendering_the_home_page_in_welsh_should_show_the_welsh_heading', () => {
    const html = env.render('home.njk', welshI18n);

    expect(html).toContain(welshI18n.heading);
  });
});
