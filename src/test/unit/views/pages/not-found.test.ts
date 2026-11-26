import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/not-found.json');

describe('Not found page', () => {
  test('the_not_found_page_should_show_its_heading_and_typo_advice', () => {
    const html = env.render('not-found.njk', i18n);
    expect(html).toContain(i18n.heading);
    expect(html).toContain(i18n.typo_message);
  });
});
