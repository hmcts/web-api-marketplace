import { expect } from 'chai';
import request from 'supertest';

jest.mock('../../main/services/SignIn', () => ({ signIn: jest.fn() }));
jest.mock('../../main/services/Requests', () => ({
  getRequestsFor: jest.fn().mockResolvedValue({ ok: true, requests: [] }),
}));

import { app } from '../../main/app';

const { signIn } = require('../../main/services/SignIn');

const user = { email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

describe('Session and the account navigation', () => {
  beforeEach(() => (signIn as jest.Mock).mockReset());

  test('an_anonymous_visitor_should_see_sign_in_in_the_navigation', async () => {
    await request(app)
      .get('/')
      .expect(res => expect(navItem(res.text)).to.equal('/sign-in'));
  });

  test('an_anonymous_visitor_should_not_be_given_a_session_cookie', async () => {
    await request(app)
      .get('/')
      .expect(res => expect(res.headers['set-cookie'] ?? []).to.not.satisfy(hasSessionCookie));
  });

  test('a_signed_in_user_should_see_your_account_in_the_navigation', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user });
    const agent = request.agent(app);

    await agent.post('/sign-in').send({ email: user.email, password: 'any' }).expect(302);

    await agent.get('/').expect(res => {
      expect(navItem(res.text)).to.equal('/account');
      expect(res.text).to.match(/Your account/);
    });
  });

  test('a_signed_in_user_should_see_their_details_on_the_account_page', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user });
    const agent = request.agent(app);

    await agent.post('/sign-in').send({ email: user.email, password: 'any' });

    await agent.get('/account').expect(res => {
      expect(res.status).to.equal(200);
      expect(res.text).to.contain('Joe Bloggs');
      expect(res.text).to.contain('HMCTS DTS');
    });
  });

  test('a_signed_out_visitor_should_be_redirected_away_from_the_account_page', async () => {
    await request(app)
      .get('/account')
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/sign-in');
      });
  });

  test('signing_out_should_return_the_navigation_to_sign_in', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user });
    const agent = request.agent(app);

    await agent.post('/sign-in').send({ email: user.email, password: 'any' });
    await agent.post('/sign-out').expect(302);

    await agent.get('/').expect(res => expect(navItem(res.text)).to.equal('/sign-in'));
  });

  test('a_rejected_sign_in_should_leave_the_visitor_signed_out', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: false });
    const agent = request.agent(app);

    await agent.post('/sign-in').send({ email: user.email, password: 'wrong' }).expect(401);

    await agent.get('/account').expect(res => expect(res.headers.location).to.equal('/sign-in'));
  });

  test('visiting_register_should_return_200_saying_it_is_not_implemented', async () => {
    await request(app)
      .get('/register')
      .expect(res => {
        expect(res.status).to.equal(200);
        expect(res.text).to.contain('Not implemented');
      });
  });
});

function hasSessionCookie(cookies: string[]): boolean {
  return cookies.some(cookie => cookie.startsWith('connect.sid='));
}

/**
 * The href of the last service-navigation item — the one that swaps between sign in and
 * the account. Matching on the href rather than the label, because govuk-frontend renders
 * the label on its own line with surrounding whitespace.
 */
function navItem(html: string): string | undefined {
  const links = [...html.matchAll(/govuk-service-navigation__link" href="([^"]+)"/g)];
  return links.at(-1)?.[1];
}
