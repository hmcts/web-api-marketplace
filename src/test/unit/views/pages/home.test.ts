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

  test('rendering_the_home_page_for_a_signed_in_user_should_list_every_card', () => {
    const html = env.render('home.njk', { ...i18n, user: { email: 'joe@example.com' } });

    for (const card of i18n.cards) {
      expect(html).toContain(card.heading);
      expect(html).toContain(card.href);
    }
  });

  test('rendering_the_home_page_for_a_signed_out_visitor_should_offer_no_cards', () => {
    // Both cards lead to journeys that need an account, so they are not advertised until
    // there is one. requireSignIn is what actually refuses the request.
    const html = env.render('home.njk', i18n);

    for (const card of i18n.cards) {
      expect(html).not.toContain(card.href);
    }
    expect(html).toContain(i18n.signInButton);
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
