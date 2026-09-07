import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/SignIn', () => ({ signIn: jest.fn() }));
jest.mock('../../main/services/Requests', () => ({
  getRequestsFor: jest.fn(),
  deleteRequest: jest.fn(),
  isRequestType: (value: unknown) => value === 'SUBSCRIPTION' || value === 'PUBLISH',
}));

import { app } from '../../main/app';

const { getRequestsFor, deleteRequest } = require('../../main/services/Requests');
const { signIn } = require('../../main/services/SignIn');

const user = { id: 1, email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

const submitted = {
  reference: 'AR-2026-IPCOC1',
  type: 'SUBSCRIPTION',
  submittedAt: '2026-09-03T11:02:51',
  status: 'NEW',
};

/** A signed-in agent, so the session cookie carries between the calls under test. */
const signedIn = async () => {
  (signIn as jest.Mock).mockResolvedValue({ ok: true, user });
  const agent = request.agent(app);
  await agent.post('/sign-in').send({ email: user.email, password: 'any' }).expect(302);
  return agent;
};

describe('Deleting a request from My requests', () => {
  beforeEach(() => {
    (signIn as jest.Mock).mockReset();
    (getRequestsFor as jest.Mock).mockReset().mockResolvedValue({ ok: true, requests: [submitted] });
    (deleteRequest as jest.Mock).mockReset().mockResolvedValue(true);
  });

  test('a_listed_request_should_come_with_a_delete_that_posts_rather_than_links', async () => {
    const agent = await signedIn();

    await agent.get('/account').expect(res => {
      expect(res.status).to.equal(200);
      expect(res.text).to.contain('action="/account/delete-request"');
      expect(res.text).to.contain('value="AR-2026-IPCOC1"');
    });
  });

  test('deleting_should_be_attributed_to_the_signed_in_user_and_confirmed_afterwards', async () => {
    const agent = await signedIn();

    await agent
      .post('/account/delete-request')
      .send({ reference: submitted.reference, type: submitted.type })
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/account');
      });

    expect((deleteRequest as jest.Mock).mock.calls[0]).to.eql([user.id, 'SUBSCRIPTION', submitted.reference]);

    (getRequestsFor as jest.Mock).mockResolvedValue({ ok: true, requests: [] });

    await agent.get('/account').expect(res => expect(res.text).to.contain('Your request has been deleted'));
  });

  test('the_confirmation_should_not_be_repeated_on_the_next_visit', async () => {
    const agent = await signedIn();

    await agent.post('/account/delete-request').send({ reference: submitted.reference, type: submitted.type });
    await agent.get('/account');

    await agent.get('/account').expect(res => expect(res.text).to.not.contain('Your request has been deleted'));
  });

  test('a_backend_that_refuses_should_be_reported_rather_than_shown_as_deleted', async () => {
    (deleteRequest as jest.Mock).mockResolvedValue(false);
    const agent = await signedIn();

    await agent.post('/account/delete-request').send({ reference: submitted.reference, type: submitted.type });

    await agent.get('/account').expect(res => {
      expect(res.text).to.contain('could not be deleted');
      expect(res.text).to.not.contain('Your request has been deleted');
    });
  });

  test('a_signed_out_visitor_should_not_be_able_to_delete_anything', async () => {
    await request(app)
      .post('/account/delete-request')
      .send({ reference: submitted.reference, type: submitted.type })
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/sign-in');
      });

    expect((deleteRequest as jest.Mock).mock.calls).to.have.length(0);
  });
});
