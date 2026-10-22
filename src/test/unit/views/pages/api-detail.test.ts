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
const links = { docsUrl: 'https://hmcts.github.io/api-one/', repoUrl: 'https://github.com/hmcts/api-one' };

describe('API detail page', () => {
  test('each_paragraph_of_the_description_should_be_shown_the_first_as_the_lead', () => {
    const html = env.render('api-catalogue/detail.njk', {
      api,
      ...links,
      descriptionParagraphs: ['First paragraph.', 'Second paragraph.'],
    });

    expect(html).toContain('<p class="govuk-body-l">First paragraph.</p>');
    expect(html).toContain('<p class="govuk-body">Second paragraph.</p>');
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
});
