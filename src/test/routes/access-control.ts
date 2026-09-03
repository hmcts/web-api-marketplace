import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/SignIn', () => ({ signIn: jest.fn() }));
jest.mock('../../main/services/Requests', () => ({
  getRequestsFor: jest.fn().mockResolvedValue({ ok: true, requests: [] }),
}));

import { app } from '../../main/app';

const { signIn } = require('../../main/services/SignIn');

const user = { email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

const guarded: [string, string][] = [
  ['GET', '/subscribe'],
  ['POST', '/subscribe'],
  ['GET', '/subscribe/check-answers'],
  ['POST', '/subscribe/check-answers'],
  ['GET', '/subscribe/confirmation'],
  ['GET', '/publish'],
  ['POST', '/publish'],
  ['GET', '/publish/check-answers'],
  ['POST', '/publish/check-answers'],
  ['GET', '/publish/confirmation'],
];

describe('Access control on the form journeys', () => {
  beforeEach(() => (signIn as jest.Mock).mockReset());

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
        expect(res.text).to.not.contain('href="/publish"');
        expect(res.text).to.contain('href="/sign-in"');
      });
  });

  test('a_signed_in_user_should_be_offered_the_journeys_and_able_to_open_them', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user });
    const agent = request.agent(app);

    await agent.post('/sign-in').send({ email: user.email, password: 'any' }).expect(302);

    await agent.get('/').expect(res => {
      expect(res.text).to.contain('href="/subscribe"');
      expect(res.text).to.contain('href="/publish"');
    });
    await agent.get('/subscribe').expect(res => expect(res.status).to.equal(200));
    await agent.get('/publish').expect(res => expect(res.status).to.equal(200));
  });

  test('the_sign_in_form_itself_should_stay_reachable_when_signed_out', async () => {
    await request(app)
      .get('/sign-in')
      .expect(res => expect(res.status).to.equal(200));
  });
});
