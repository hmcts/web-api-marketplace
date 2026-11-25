import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const counts = { users: 9, applications: '—', productionRequests: '—' };

describe('Admin dashboard', () => {
  test('the_admin_page_should_show_each_figure_with_its_label', () => {
    const html = env.render('admin.njk', { counts });

    expect(html).toMatch(/id="count-users"[\s\S]*?9[\s\S]*?registered users/);
    expect(html).toMatch(/id="count-applications"[\s\S]*?—[\s\S]*?applications/);
    expect(html).toMatch(/id="count-production-requests"[\s\S]*?—[\s\S]*?production requests/);
  });

  test('every_figure_should_link_to_the_registered_users_until_its_own_page_exists', () => {
    const html = env.render('admin.njk', { counts });

    expect(html.match(/href="\/admin\/users"/g)).toHaveLength(3);
  });

  test('the_page_should_be_captioned_for_the_marketplace_team', () => {
    const html = env.render('admin.njk', { counts });

    expect(html).toContain('Marketplace Team');
    expect(html).toMatch(/<h1 [^>]*>Admin<\/h1>/);
  });

  test('figures_that_could_not_be_loaded_should_say_so_rather_than_read_as_zero', () => {
    const html = env.render('admin.njk', { couldNotLoad: true });

    expect(html).toContain('counts-unavailable');
    expect(html).not.toContain('count-users');
  });
});
