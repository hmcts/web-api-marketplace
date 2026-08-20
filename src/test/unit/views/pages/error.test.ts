import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/error.json');

describe('Error page', () => {
  test('renders error content', () => {
    const html = env.render('error.njk', i18n);
    expect(html).toContain(i18n.h1);
  });
});
