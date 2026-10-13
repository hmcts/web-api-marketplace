import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/signIn.json');

describe('Sign in problem page', () => {
  const render = (problem: string) => env.render('sign-in.njk', { ...i18n, problem, breadcrumb: { home: 'Home' } });

  test.each([
    ['cancelled', i18n.problemCancelled],
    ['expired', i18n.problemExpired],
    ['unavailable', i18n.problemUnavailable],
    ['rejected', i18n.problemRejected],
  ])('a_%s_sign_in_should_say_what_happened', (problem, message) => {
    const html = render(problem);

    expect(html).toContain(i18n.heading);
    expect(html).toContain(message);
  });

  test('every_problem_should_offer_to_sign_in_again', () => {
    const html = render('expired');

    expect(html).toContain('href="/sign-in"');
    expect(html).toContain(i18n.tryAgainButton);
  });

  test('the_page_should_never_ask_for_a_password', () => {
    // Passwords are typed on Entra's pages only.
    expect(render('rejected')).not.toContain('type="password"');
  });
});
