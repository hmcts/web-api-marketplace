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

  test('a_non_admin_should_not_see_the_admin_tab', async () => {
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

  test('a_non_admin_should_be_told_the_admin_page_is_not_found', async () => {
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

describe('The registered users page', () => {
  beforeEach(() => stubEntra().admins.add(ADMIN.oid));
  afterEach(() => stubEntra().reset());

  test('an_admin_should_see_the_registered_users', async () => {
    await signedInAs(USER);
    const agent = await signedInAs(ADMIN);
    const adminId = stubEntra().savedUsers.get(ADMIN.oid)?.id;

    await agent.get('/admin/users').expect(res => {
      expect(res.status).to.equal(200);
      expect(res.text).to.contain('<h1 class="govuk-heading-xl">Users</h1>');
      expect(res.text).to.contain(`href="/admin/users/${adminId}"`);
      expect(res.text).to.contain('joe@example.com');
    });
  });

  test('admin_backend_calls_should_carry_a_bearer_id_token', async () => {
    const agent = await signedInAs(ADMIN);

    await agent.get('/admin/users').expect(res => expect(res.status).to.equal(200));
    expect(stubEntra().lastBackendAuthorization).to.match(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  test('a_non_admin_should_be_told_the_users_page_is_not_found', async () => {
    const agent = await signedInAs(USER);

    await agent.get('/admin/users').expect(res => expect(res.status).to.equal(404));
  });

  test('an_admin_should_see_one_user', async () => {
    await signedInAs(USER);
    const agent = await signedInAs(ADMIN);
    const joeId = stubEntra().savedUsers.get(USER.oid)?.id;

    await agent.get(`/admin/users/${joeId}`).expect(res => {
      expect(res.status).to.equal(200);
      expect(res.text).to.contain('<h1 class="govuk-heading-xl">Joe Bloggs</h1>');
      expect(res.text).to.contain('Production credentials requests');
    });
  });

  test('a_non_admin_should_be_told_a_user_page_is_not_found', async () => {
    const agent = await signedInAs(USER);
    const joeId = stubEntra().savedUsers.get(USER.oid)?.id;

    await agent.get(`/admin/users/${joeId}`).expect(res => expect(res.status).to.equal(404));
  });

  test('an_unknown_user_id_should_be_not_found', async () => {
    const agent = await signedInAs(ADMIN);

    await agent.get('/admin/users/999').expect(res => expect(res.status).to.equal(404));
  });

  test('an_admin_whose_role_was_removed_in_entra_should_be_told_both_pages_are_not_found_after_a_refresh', async () => {
    stubEntra().tokenLifetime = '60s';
    const agent = await signedInAs(ADMIN);
    const adminId = stubEntra().savedUsers.get(ADMIN.oid)?.id;
    stubEntra().admins.delete(ADMIN.oid);

    await agent.get('/admin/users').expect(res => expect(res.status).to.equal(404));
    await agent.get(`/admin/users/${adminId}`).expect(res => expect(res.status).to.equal(404));
  });

  test('a_signed_out_visitor_should_be_sent_to_sign_in_from_the_users_page', async () => {
    await request(app)
      .get('/admin/users')
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/sign-in');
      });
  });
});
