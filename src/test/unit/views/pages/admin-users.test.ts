import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

describe('Admin users page', () => {
  test('the_users_table_should_have_a_caption_for_screen_readers', () => {
    const html = env.render('admin/users.njk', {
      q: '',
      count: 1,
      users: [
        { id: 2, name: 'Grace Hopper', email: 'grace.hopper@hmcts.net', joined: '', lastSignedIn: '', applications: 0 },
      ],
      couldNotLoad: false,
    });

    expect(html).toContain('<caption class="govuk-table__caption govuk-visually-hidden">Registered users</caption>');
  });
});
