import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

describe('AccessibilityStatement View', () => {
  const i18n = require('../../../../main/locales/en/accessibilityStatement.json');

  test('renders_the_statement_for_this_service', () => {
    const html = env.render('accessibility-statement.njk', i18n);

    expect(html).toContain(i18n.title);
    expect(html).toContain('Accessibility statement for the HMCTS API Marketplace');
    expect(html).toContain('id="enforcement"');
  });

  test('does_not_describe_the_service_it_was_copied_from', () => {
    const html = env.render('accessibility-statement.njk', i18n);

    expect(html).not.toContain('Find a Court or Tribunal');
  });

  test('makes_no_compliance_claim_before_an_audit', () => {
    const html = env.render('accessibility-statement.njk', i18n);

    expect(html).not.toContain('fully compliant');
    expect(html).toContain('NEEDS SIGN-OFF');
  });
});
