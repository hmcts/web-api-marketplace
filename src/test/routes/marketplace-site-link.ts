import { expect } from 'chai';
import config from 'config';
import request from 'supertest';

import { app } from '../../main/app';

/**
 * The service name links back to the public marketplace site, so someone who came here to
 * subscribe or publish can return to the front door. The GOV.UK crown is left alone.
 *
 * The address is configuration, not a literal in the template: the site was served from
 * /v2/ and has since moved to the root of the same host, so the next move is a
 * MARKETPLACE_SITE_URL change on the deployment rather than a code change and a release.
 */
describe('The link back to the marketplace site', () => {
  const configured = config.get<string>('marketplaceSite.url');

  const serviceNameHref = (html: string) =>
    html
      .slice(html.indexOf('govuk-service-navigation__service-name'))
      .match(/<a href="([^"]*)" class="govuk-service-navigation__link"/)?.[1];

  const crownHref = (html: string) =>
    html.match(/<a href="([^"]*)" class="govuk-header__link govuk-header__link--homepage"/)?.[1];

  test('the_service_name_on_a_real_page_should_point_at_the_configured_site', async () => {
    await request(app)
      .get('/')
      .expect(res => {
        expect(res.status).to.equal(200);
        expect(serviceNameHref(res.text), 'service name should link to the configured site').to.equal(configured);
      });
  });

  test('the_govuk_crown_should_be_left_pointing_at_this_service', async () => {
    await request(app)
      .get('/')
      .expect(res => {
        expect(crownHref(res.text), 'crown should be untouched').to.equal('/');
      });
  });

  test('the_configured_site_should_be_the_public_marketplace_and_not_this_service', async () => {
    expect(configured).to.match(/^https:\/\/hmcts\.github\.io\/hmcts-api-marketplace/);
  });

  test('every_page_should_carry_the_link_not_just_the_home_page', async () => {
    for (const path of ['/sign-in', '/cookies', '/accessibility-statement']) {
      await request(app)
        .get(path)
        .expect(res => {
          expect(serviceNameHref(res.text), `service name on ${path}`).to.equal(configured);
        });
    }
  });
});
