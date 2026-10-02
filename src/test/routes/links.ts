import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
}));

import { app } from '../../main/app';
import { CONTENT_PAGES } from '../../main/controllers/ContentController';
import { MemoryStore, useDataStore } from '../../main/modules/store';

import { Agent, CATALOGUE, createdApplication, signedInConsumer } from './helpers/consumer';

const { getCatalogueApis } = require('../../main/services/ApiCatalogue');

/**
 * Every internal link on every page must lead somewhere.
 *
 * Crawls the whole site from the home page, following every href that points at this
 * service, once signed out and once signed in as a consumer with an application and a
 * production credentials request — so the pages that only exist for a signed-in user are
 * crawled too. Each page must answer 200, or, signed out, redirect to sign in. A link
 * that 404s or errors fails the build, which is the point: the migration from GitHub
 * Pages must not leave a broken link behind.
 */
describe('Links', () => {
  beforeEach(() => {
    useDataStore(new MemoryStore());
    (getCatalogueApis as jest.Mock).mockResolvedValue(CATALOGUE);
  });

  test('every_link_reachable_signed_out_should_work', async () => {
    const visited = await crawl(request.agent(app), true);

    // The migrated guidance pages and the legal pages must all be reachable from the
    // home page by following links, not merely exist.
    for (const path of [...Object.keys(CONTENT_PAGES), '/api-catalogue', '/cookies', '/accessibility-statement']) {
      expect(visited, `${path} should be linked from somewhere`).to.include(path);
    }
  });

  test('every_link_reachable_signed_in_should_work', async () => {
    const agent = await signedInConsumer('ada@example.com');
    const id = await createdApplication(agent);
    await submitProductionRequest(agent, id);

    const visited = await crawl(agent, false);

    for (const path of [
      '/account',
      '/account/applications',
      `/account/applications/${id}`,
      `/account/applications/${id}/apis`,
      `/account/applications/${id}/apis/${CATALOGUE[0].name}`,
      `/account/applications/${id}/client-secret`,
      `/account/applications/${id}/delete`,
      '/account/production-credentials',
      '/api-catalogue/request-new-api',
    ]) {
      expect(visited, `${path} should be linked from somewhere`).to.include(path);
    }
    expect(visited.some(path => /^\/account\/production-credentials\/PCR-/.test(path))).to.equal(true);
  });
});

/** Pages a crawler must not follow: signing out ends the signed-in crawl. */
const SKIP = ['/sign-out'];

async function crawl(agent: Agent, signedOut: boolean): Promise<string[]> {
  const queue = ['/'];
  const visited = new Set<string>();
  const failures: string[] = [];

  while (queue.length) {
    const url = queue.shift() as string;
    const path = url.split('?')[0];

    if (visited.has(url) || SKIP.includes(path)) {
      continue;
    }
    visited.add(url);

    const res = await agent.get(url);
    const location: string | undefined = res.headers.location;

    // A redirect within the service — sign in turning away a signed-out visitor, or
    // /register sending someone already signed in to their account — is fine as long as
    // where it leads works, so it is followed rather than reported.
    if (res.status === 302 && location?.startsWith('/') && !location.startsWith('//')) {
      if (location === '/sign-in' && !signedOut) {
        failures.push(`${url} sent a signed-in user to sign in`);
      }
      queue.push(location);
      continue;
    }

    if (res.status !== 200) {
      failures.push(`${url} answered ${res.status}${location ? ` to ${location}` : ''}`);
      continue;
    }

    for (const [, href] of (res.text ?? '').matchAll(/href="([^"]*)"/g)) {
      const target = href.replace(/&amp;/g, '&').split('#')[0];
      if (
        target.startsWith('/') &&
        !target.startsWith('//') &&
        !target.startsWith('/assets/') &&
        !/\.\w+$/.test(target)
      ) {
        queue.push(target);
      }
    }
  }

  expect(failures, `broken links:\n${failures.join('\n')}`).to.deep.equal([]);
  return [...visited].map(url => url.split('?')[0]);
}

async function submitProductionRequest(agent: Agent, applicationId: string): Promise<void> {
  await agent
    .post('/account/production-credentials')
    .type('form')
    .send({
      application: applicationId,
      organisation: 'Analytical Engines Ltd',
      'go-live-day': '1',
      'go-live-month': '4',
      'go-live-year': String(new Date().getFullYear() + 1),
      'call-volume': 'medium',
      dpia: 'yes',
      dsa: 'in-place',
      'security-contact': 'security@example.com',
      'use-case': 'Case workers look up hearing outcomes.',
      declaration: 'confirmed',
    })
    .expect(302);
  await agent.post('/account/production-credentials/check-answers').expect(200);
}
