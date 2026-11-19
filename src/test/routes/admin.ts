import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/Requests', () => ({
  getRequestsFor: jest.fn().mockResolvedValue({ ok: true, requests: [] }),
}));

import { app } from '../../main/app';

import { claimsFor, signInThroughEntra, stubEntra } from './helpers/entra';

const ADMIN = claimsFor('admin@example.com', 'Ada Admin');
const USER = claimsFor('joe@example.com', 'Joe Bloggs');

const signedInAs = async (claims: typeof ADMIN) => {
  const agent = request.agent(app);
  await signInThroughEntra(agent, claims);
  return agent;
};

describe('The admin tab', () => {
  beforeEach(() => stubEntra().admins.add(ADMIN.oid));
  afterEach(() => stubEntra().reset());

  test('an_admin_should_see_the_admin_tab', async () => {
    const agent = await signedInAs(ADMIN);

    await agent.get('/').expect(res => expect(res.text).to.contain('href="/admin"'));
  });

  test('a_user_should_not_see_the_admin_tab', async () => {
    const agent = await signedInAs(USER);

    await agent.get('/').expect(res => expect(res.text).to.not.contain('href="/admin"'));
  });

  test('a_signed_out_visitor_should_not_see_the_admin_tab', async () => {
    await request(app)
      .get('/')
      .expect(res => expect(res.text).to.not.contain('href="/admin"'));
  });

  test('an_admin_should_reach_the_admin_page', async () => {
    const agent = await signedInAs(ADMIN);

    await agent.get('/admin').expect(res => {
      expect(res.status).to.equal(200);
      expect(res.text).to.contain('<h1 class="govuk-heading-xl">Admin</h1>');
    });
  });

  test('a_user_should_be_told_the_admin_page_is_not_found', async () => {
    const agent = await signedInAs(USER);

    await agent.get('/admin').expect(res => expect(res.status).to.equal(404));
  });

  test('a_signed_out_visitor_should_be_sent_to_sign_in', async () => {
    await request(app)
      .get('/admin')
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/sign-in');
      });
  });
});
