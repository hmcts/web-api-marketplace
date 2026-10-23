import * as path from 'path';

import { describe, expect, test } from '@jest/globals';
import * as nunjucks from 'nunjucks';

import { env } from '../helpers/nunjucksEnv';

/** The app escapes what it renders; the shared test environment does not, so this one does. */
const escaping = new nunjucks.Environment(
  new nunjucks.FileSystemLoader([
    path.dirname(require.resolve('govuk-frontend/package.json')) + '/dist',
    path.resolve(__dirname, '../../../../main/views'),
  ]),
  { autoescape: true }
);

const api = { name: 'api-one', title: 'API one', team: 'team-one', domain: 'Other', platform: 'Other' };
const owningTeam = 'Crime - Scheduling and Listing';
const links = { docsUrl: 'https://hmcts.github.io/api-one/', repoUrl: 'https://github.com/hmcts/api-one' };

describe('API detail page', () => {
  test('each_paragraph_of_the_description_should_be_shown_in_the_same_size', () => {
    const html = env.render('api-catalogue/detail.njk', {
      api,
      ...links,
      descriptionParagraphs: ['First paragraph.', 'Second paragraph.'],
    });

    expect(html).toContain('<p class="govuk-body">First paragraph.</p>');
    expect(html).toContain('<p class="govuk-body">Second paragraph.</p>');
    expect(html).not.toContain('govuk-body-l');
  });

  test('a_description_should_be_shown_as_text_never_as_markup', () => {
    const html = escaping.render('api-catalogue/detail.njk', {
      api,
      ...links,
      descriptionParagraphs: ['<script>alert(1)</script> & more'],
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('no_description_should_show_no_lead_paragraph', () => {
    const html = env.render('api-catalogue/detail.njk', { api, ...links, descriptionParagraphs: [] });

    expect(html).not.toContain('govuk-body-l');
  });

  describe('layout', () => {
    const render = (extra: Record<string, unknown> = {}) =>
      env.render('api-catalogue/detail.njk', {
        api,
        ...links,
        owningTeam,
        descriptionParagraphs: ['A description.'],
        ...extra,
      });

    test('the_description_should_sit_under_a_what_does_this_api_do_heading', () => {
      const html = render();

      expect(html).toContain('What does this API do?');
      expect(html.indexOf('A description.')).toBeGreaterThan(html.indexOf('What does this API do?'));
    });

    test('an_api_with_no_description_should_not_show_the_heading', () => {
      expect(render({ descriptionParagraphs: [] })).not.toContain('What does this API do?');
    });

    test('the_action_should_come_before_the_summary_and_the_documentation', () => {
      const html = render();
      const at = (text: string) => html.indexOf(text);

      expect(at('Use this API')).toBeGreaterThan(at('A description.'));
      expect(at('id="add-to-application"')).toBeGreaterThan(at('Use this API'));
      expect(at('About this API')).toBeGreaterThan(at('id="add-to-application"'));
      expect(at('>Documentation<')).toBeGreaterThan(at('About this API'));
    });

    test('the_summary_should_list_team_platform_domain_and_repository_name_and_no_status', () => {
      const html = render();

      for (const label of ['Owning team', 'Platform', 'Domain', 'Repository name']) {
        expect(html).toContain(label);
      }
      expect(html).not.toContain('Published');
      expect(html).not.toContain('>Name<');
    });

    test('the_owning_team_should_be_the_one_passed_in', () => {
      expect(render()).toContain('Crime - Scheduling and Listing');
    });

    test('the_page_should_not_repeat_the_breadcrumb_as_a_caption', () => {
      expect(render()).not.toContain('govuk-caption-l');
    });

    test('a_signed_out_visitor_should_be_told_they_need_an_account_before_the_button', () => {
      const html = render();

      expect(html).toContain('You need a');
      expect(html.indexOf('developer account')).toBeLessThan(html.indexOf('id="add-to-application"'));
    });

    test('a_signed_in_user_should_not_be_told_they_need_an_account', () => {
      const html = render({ user: { email: 'joe@example.com' } });

      expect(html).not.toContain('developer account');
      expect(html).toContain('consumer guidance');
    });
  });
});
