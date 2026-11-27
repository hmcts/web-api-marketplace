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

  test('the_applications_figure_should_link_to_the_applications', () => {
    const html = env.render('admin.njk', { counts });

    expect(html).toMatch(/href="\/admin\/applications" id="count-applications"/);
  });

  test('the_other_figures_should_link_to_the_registered_users_until_their_own_page_exists', () => {
    const html = env.render('admin.njk', { counts });

    expect(html.match(/href="\/admin\/users"/g)).toHaveLength(2);
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

  test('the_builds_should_be_in_the_markup_when_the_page_was_given_them', () => {
    const build = { web: '489cd961 \u00b7 27 Nov, 08:18', service: '840eb3e \u00b7 27 Nov, 09:57' };

    const html = env.render('admin.njk', { counts, build });

    expect(html).toContain('<meta name="build:web" content="489cd961 \u00b7 27 Nov, 08:18">');
    expect(html).toContain('<meta name="build:service" content="840eb3e \u00b7 27 Nov, 09:57">');
  });

  test('the_builds_should_be_readable_only_in_the_markup_and_never_on_the_page', () => {
    const build = { web: '489cd961', service: '840eb3e' };

    const html = env.render('admin.njk', { counts, build });

    const body = html.slice(html.indexOf('<body'));

    expect(body).not.toContain('489cd961');
    expect(body).not.toContain('840eb3e');
  });

  test('a_page_without_the_builds_should_carry_no_build_markup', () => {
    const html = env.render('admin.njk', { counts });

    expect(html).not.toContain('name="build:');
  });
});
