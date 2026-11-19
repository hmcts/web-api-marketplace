import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

describe('Admin dashboard', () => {
  test('the_admin_page_should_link_to_the_registered_users', () => {
    const html = env.render('admin.njk', {});

    expect(html).toMatch(/<a [^>]*href="\/admin\/users"[^>]*>Registered users<\/a>/);
  });
});
