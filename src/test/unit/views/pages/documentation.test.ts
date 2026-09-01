import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/documentation.json');

describe('Documentation page', () => {
  const data = { ...i18n, breadcrumb: { home: 'Home' } };

  test('rendering_the_page_should_show_the_heading_and_lede', () => {
    const html = env.render('documentation.njk', data);

    expect(html).toContain(i18n.heading);
    expect(html).toContain(i18n.lede);
  });

  test('rendering_the_page_should_list_every_journey_step', () => {
    const html = env.render('documentation.njk', data);

    for (const step of i18n.journey.steps) {
      expect(html).toContain(step);
    }
  });

  test('rendering_the_page_should_list_every_section_link', () => {
    const html = env.render('documentation.njk', data);

    for (const section of i18n.sections) {
      expect(html).toContain(section.heading);
      for (const link of section.links) {
        expect(html).toContain(link.href);
        expect(html).toContain(link.text);
      }
    }
  });

  test('rendering_the_page_should_show_breadcrumbs_not_a_back_link', () => {
    const html = env.render('documentation.njk', data);

    expect(html).toContain('govuk-breadcrumbs');
    expect(html).not.toContain('govuk-back-link');
  });
});
