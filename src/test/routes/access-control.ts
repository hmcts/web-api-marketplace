import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/Requests', () => ({
  getRequestsFor: jest.fn().mockResolvedValue({ ok: true, requests: [] }),
  deleteRequest: jest.fn().mockResolvedValue(true),
  isRequestType: (value: unknown) => value === 'SUBSCRIPTION' || value === 'PUBLISH',
}));

import { app } from '../../main/app';

import { claimsFor, signInThroughEntra } from './helpers/entra';

const signedIn = async () => {
  const agent = request.agent(app);
  await signInThroughEntra(agent, claimsFor('joe@example.com', 'Joe Bloggs'));
  return agent;
};

const guarded: [string, string][] = [
  ['GET', '/account'],
  ['POST', '/account/delete-request'],
];

describe('Access control on the form journeys', () => {
  test.each(guarded)('a_signed_out_%s_to_%s_should_be_redirected_to_sign_in', async (method, path) => {
    const send = method === 'POST' ? request(app).post(path).send({}) : request(app).get(path);

    await send.expect(res => {
      expect(res.status, `${method} ${path} should redirect`).to.equal(302);
      expect(res.headers.location, `${method} ${path} should go to sign in`).to.equal('/sign-in');
    });
  });

  test('a_signed_out_visitor_should_not_be_offered_the_journeys_in_the_navigation', async () => {
    await request(app)
      .get('/')
      .expect(res => {
        expect(res.text).to.not.contain('href="/subscribe"');
        expect(res.text).to.contain('href="/sign-in"');
      });
  });

  test.each(['/subscribe', '/subscribe/check-answers', '/subscribe/confirmation'])(
    'the_subscribe_journey_at_%s_should_be_switched_off_even_when_signed_in',
    async path => {
      const agent = await signedIn();

      await request(app)
        .get(path)
        .expect(res => expect(res.status).to.equal(404));
      await agent.get(path).expect(res => expect(res.status).to.equal(404));
    }
  );

  test.each(['/publish', '/publish/check-answers', '/publish/confirmation'])(
    'the_publish_an_api_journey_at_%s_should_be_switched_off_even_when_signed_in',
    async path => {
      const agent = await signedIn();

      await request(app)
        .get(path)
        .expect(res => expect(res.status).to.equal(404));
      await agent.get(path).expect(res => expect(res.status).to.equal(404));
    }
  );

  test.each(['/api-catalogue/request-new-api', '/api-catalogue/request-new-api/check-answers'])(
    'the_request_a_new_api_journey_at_%s_should_be_switched_off_even_when_signed_in',
    async path => {
      const agent = await signedIn();

      await request(app)
        .get(path)
        .expect(res => expect(res.status).to.equal(404));
      await agent.get(path).expect(res => expect(res.status).to.equal(404));
    }
  );

  test('the_publish_guidance_pages_should_still_be_reachable', async () => {
    await request(app)
      .get('/documentation/producer-guidance')
      .expect(res => expect(res.status).to.equal(200));
    await request(app)
      .get('/documentation/data-governance')
      .expect(res => expect(res.status).to.equal(200));
  });

  test.each([
    '/documentation/architecture',
    '/documentation/architecture-principles',
    '/documentation/our-capabilities',
    '/documentation/our-api-technologies',
    '/documentation/glossary',
    '/documentation/technology-introduction',
    '/documentation/building-software',
    '/documentation/case-studies',
    '/documentation/resources',
  ])('the_page_at_%s_should_be_off_the_site_for_now', async path => {
    await request(app)
      .get(path)
      .expect(res => expect(res.status).to.equal(404));
  });

  test('the_welcome_page_should_be_gone_even_when_signed_in', async () => {
    const agent = await signedIn();

    await agent.get('/account/welcome').expect(res => expect(res.status).to.equal(404));
  });

  test('sign_in_itself_should_stay_reachable_when_signed_out', async () => {
    await request(app)
      .get('/sign-in')
      .expect(res => expect(res.status).to.equal(302));
  });
});
