import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

describe('AccessibilityStatement View', () => {
  const i18n = require('../../../../main/locales/en/accessibilityStatement.json');
  const welshI18n = require('../../../../main/locales/cy/accessibilityStatement.json');

  test('renders the accessibility statement page with correct English content', () => {
    const html = env.render('accessibility-statement.njk', i18n);

    // Check page title
    expect(html).toContain(i18n.title);

    // Check H1
    expect(html).toContain('<h1 class="govuk-heading-xl">');
    expect(html).toContain(i18n.h1);

    // Check some paragraphs
    expect(html).toContain(i18n.p2);
    expect(html).toContain(i18n.p3);

    // Check bullets
    i18n.bullets.forEach((bullet: string) => {
      expect(html).toContain(bullet);
    });

    // Check Accessibility details
    expect(html).toContain(i18n.accessibility_details.heading);
    expect(html).toContain(i18n.accessibility_details.intro);
    expect(html).toContain(i18n.accessibility_details.sub_heading);
    expect(html).toContain(i18n.accessibility_details.main_content.p1);
    expect(html).toContain(i18n.accessibility_details.main_content.p2.content);
    for (const bullet of i18n.accessibility_details.main_content.p2.bullets) {
      expect(html).toContain(bullet);
    }
    expect(html).toContain(i18n.accessibility_details.main_content.p3);

    // Check H2s
    expect(html).toContain(i18n.h3);
    expect(html).toContain(i18n.h4);
    expect(html).toContain(i18n.h5);
    expect(html).toContain(i18n.h6);
    expect(html).toContain(i18n.h7);
    expect(html).toContain(i18n.h8);
    expect(html).toContain(i18n.h9);

    // Check H3s
    expect(html).toContain(i18n.h14);

    // Check H4s
    expect(html).toContain(i18n.h10);
    expect(html).toContain(i18n.h11);
    expect(html).toContain(i18n.h12);

    // Check links
    expect(html).toContain('href="http://www.find-court-tribunal.service.gov.uk"');
    expect(html).toContain('href="https://mcmw.abilitynet.org.uk/"');
    expect(html).toContain('href="mailto:hmctsfinderfeedback@justice.gov.uk"');
    expect(html).toContain('href="https://www.equalityadvisoryservice.com/"');
  });

  test('renders the accessibility statement page with correct Welsh content', () => {
    const html = env.render('accessibility-statement.njk', welshI18n);

    // Check page title
    expect(html).toContain(welshI18n.title);

    // Check H1
    expect(html).toContain('<h1 class="govuk-heading-xl">');
    expect(html).toContain(welshI18n.h1);

    // Check some paragraphs
    expect(html).toContain(welshI18n.p2);
    expect(html).toContain(welshI18n.p3);

    // Check bullets
    welshI18n.bullets.forEach((bullet: string) => {
      expect(html).toContain(bullet);
    });

    // Check Accessibility details
    expect(html).toContain(welshI18n.accessibility_details.heading);
    expect(html).toContain(welshI18n.accessibility_details.intro);
    expect(html).toContain(welshI18n.accessibility_details.sub_heading);
    expect(html).toContain(welshI18n.accessibility_details.main_content.p1);
    expect(html).toContain(welshI18n.accessibility_details.main_content.p2.content);
    for (const bullet of welshI18n.accessibility_details.main_content.p2.bullets) {
      expect(html).toContain(bullet);
    }
    expect(html).toContain(welshI18n.accessibility_details.main_content.p3);

    // Check H2s
    expect(html).toContain(welshI18n.h3);
    expect(html).toContain(welshI18n.h4);
    expect(html).toContain(welshI18n.h5);
    expect(html).toContain(welshI18n.h6);
    expect(html).toContain(welshI18n.h7);
    expect(html).toContain(welshI18n.h8);
    expect(html).toContain(welshI18n.h9);

    // Check H3s
    expect(html).toContain(welshI18n.h14);

    // Check H4s
    expect(html).toContain(welshI18n.h10);
    expect(html).toContain(welshI18n.h11);
    expect(html).toContain(welshI18n.h12);
  });
});
