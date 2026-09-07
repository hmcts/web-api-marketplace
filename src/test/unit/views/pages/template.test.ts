import { describe, expect, test } from '@jest/globals';

import { env } from '../helpers/nunjucksEnv';

const i18n = require('../../../../main/locales/en/template.json');

describe('Base template', () => {
  test('renders header/footer content', () => {
    const html = env.render('template.njk', {
      ...i18n,
      serviceName: i18n.serviceName,
      footerLinks: i18n.footerLinks,
      feedback: '',
      languageToggle: i18n.languageToggle,
      cookieBannerP1: 'Cookies',
      cookieBannerP2: 'More cookies',
      cookieBannerH1: 'Cookies',
      cookieBannerAcceptButton: 'Accept',
      cookieBannerRejectButton: 'Reject',
      cookieBannerViewCookies: 'View cookies',
      cookieBannerHideButton: 'Hide',
      jstag: '/jstag.js',
      globals: { basePath: '' },
    });

    expect(html).toContain(i18n.serviceName);
    expect(html).toContain(i18n.languageToggle);
  });

  const render = (extra: Record<string, unknown> = {}) =>
    env.render('template.njk', {
      ...i18n,
      serviceName: i18n.serviceName,
      footerLinks: i18n.footerLinks,
      feedback: '',
      languageToggle: i18n.languageToggle,
      globals: { basePath: '' },
      ...extra,
    });

  /** The GOV.UK crown's own anchor, which govuk-frontend marks as the homepage link. */
  const crownHref = (html: string) =>
    html.match(/<a href="([^"]*)" class="govuk-header__link govuk-header__link--homepage"/)?.[1];

  /** The service name's anchor, inside the service-navigation service-name span. */
  const serviceNameHref = (html: string) =>
    html
      .slice(html.indexOf('govuk-service-navigation__service-name'))
      .match(/<a href="([^"]*)" class="govuk-service-navigation__link"/)?.[1];

  test('the_service_name_should_link_back_to_the_public_marketplace_site', () => {
    const html = render({ marketplaceSiteUrl: 'https://hmcts.github.io/hmcts-api-marketplace/' });

    expect(serviceNameHref(html)).toBe('https://hmcts.github.io/hmcts-api-marketplace/');
  });

  test('a_moved_site_should_only_need_the_configured_address_to_change', () => {
    // The site already moved off /v2/ once without a template change, and the next move
    // must not need one either.
    const html = render({ marketplaceSiteUrl: 'https://example.gov.uk/somewhere-else' });

    expect(serviceNameHref(html)).toBe('https://example.gov.uk/somewhere-else');
  });

  test('an_unconfigured_site_should_leave_the_service_name_pointing_somewhere_real', () => {
    // Rather than an empty href, which would silently link to the current page.
    expect(serviceNameHref(render())).toBe('/');
  });

  test('the_govuk_crown_should_be_left_alone_and_still_lead_to_this_service', () => {
    // Only the service name was repointed. The crown keeps govuk-frontend's own default.
    const html = render({ marketplaceSiteUrl: 'https://hmcts.github.io/hmcts-api-marketplace/' });

    expect(crownHref(html)).toBe('/');
  });
});
