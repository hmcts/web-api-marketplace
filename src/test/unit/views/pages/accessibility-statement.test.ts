import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

describe('AccessibilityStatement View', () => {
  const i18n = require('../../../../main/locales/en/accessibilityStatement.json');

  test('the_statement_should_name_this_service_and_include_the_enforcement_section', () => {
    const html = env.render('accessibility-statement.njk', i18n);

    expect(html).toContain(i18n.title);
    expect(html).toContain('Accessibility statement for the HMCTS API Marketplace');
    expect(html).toContain('id="enforcement"');
  });

  test('the_statement_should_not_mention_the_service_it_was_copied_from', () => {
    const html = env.render('accessibility-statement.njk', i18n);

    expect(html).not.toContain('Find a Court or Tribunal');
  });

  test('the_statement_should_claim_no_compliance_and_be_flagged_for_sign_off', () => {
    const html = env.render('accessibility-statement.njk', i18n);

    expect(html).not.toContain('fully compliant');
    expect(html).toContain('NEEDS SIGN-OFF');
  });
});
