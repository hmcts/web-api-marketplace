import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/signIn.json');

describe('Sign in page', () => {
  const data = { ...i18n, breadcrumb: { home: 'Home' } };

  test('rendering_the_page_should_show_the_form_fields', () => {
    const html = env.render('sign-in.njk', data);

    expect(html).toContain(i18n.heading);
    expect(html).toContain(i18n.emailLabel);
    expect(html).toContain(i18n.passwordLabel);
    expect(html).toContain('method="post"');
    expect(html).toContain('name="password"');
  });

  test('rendering_without_an_error_should_not_show_the_error_summary', () => {
    const html = env.render('sign-in.njk', data);

    expect(html).not.toContain('govuk-error-summary');
  });

  test('rendering_with_an_error_should_show_the_error_summary', () => {
    const html = env.render('sign-in.njk', { ...data, error: i18n.errorRejected });

    expect(html).toContain('govuk-error-summary');
    expect(html).toContain(i18n.errorRejected);
  });

  test('rendering_with_a_submitted_email_should_keep_it_in_the_field', () => {
    const html = env.render('sign-in.njk', { ...data, error: i18n.errorRejected, email: 'joe@example.com' });

    expect(html).toContain('joe@example.com');
  });
});
