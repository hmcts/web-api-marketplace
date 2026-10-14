import { expect } from 'chai';
import request from 'supertest';

import { app } from '../../main/app';
import { codeFor } from '../stubs/entra';

import { claimsFor, signInThroughEntra, stubEntra } from './helpers/entra';

describe('Signing in with Entra', () => {
  afterEach(() => stubEntra().reset());

  test('sign_in_should_send_the_browser_to_entra_for_a_code', async () => {
    await request(app)
      .get('/sign-in')
      .expect(res => {
        expect(res.status).to.equal(302);
        const sentTo = new URL(res.headers.location);
        expect(sentTo.origin + sentTo.pathname).to.equal(stubEntra().authorizeEndpoint);
        expect(sentTo.searchParams.get('response_type')).to.equal('code');
      });
  });

  test('coming_back_with_a_good_code_should_sign_in_as_the_entra_user', async () => {
    const agent = request.agent(app);

    await signInThroughEntra(agent, claimsFor('ada@example.com')).then(res =>
      expect(res.headers.location).to.equal('/account')
    );

    await agent.get('/account').expect(res => {
      expect(res.status).to.equal(200);
      expect(res.text).to.contain('ada@example.com');
    });
  });

  test('a_callback_replayed_after_use_should_be_refused', async () => {
    const agent = request.agent(app);
    const started = await agent.get('/sign-in').expect(302);
    const sentTo = new URL(started.headers.location);
    const callback = `/auth/callback?code=${codeFor(claimsFor('ada@example.com'), sentTo.searchParams.get('nonce') as string)}&state=${sentTo.searchParams.get('state')}`;

    await agent.get(callback).expect(302);
    await request(app)
      .get(callback)
      .expect(res => expect(res.status).to.equal(400));
  });

  test('entra_being_unreachable_should_be_reported_as_an_outage_not_a_wrong_password', async () => {
    stubEntra().failTokenRequests(503);

    await signInThroughEntra(request.agent(app), claimsFor('ada@example.com')).then(res => {
      expect(res.status).to.equal(502);
      expect(res.text).to.contain('Sign in is not available at the moment');
    });
  });

  test('a_token_that_cannot_be_trusted_should_not_sign_anyone_in', async () => {
    stubEntra().answerTokenRequestsWith(claims => stubEntra().idToken(claims, 'n', { aud: 'some-other-app' }));
    const agent = request.agent(app);

    await signInThroughEntra(agent, claimsFor('ada@example.com')).then(res => {
      expect(res.status).to.equal(401);
      expect(res.text).to.contain('We could not confirm who you are');
    });
    await agent.get('/account').expect(res => expect(res.headers.location).to.equal('/sign-in'));
  });
});

describe('With Entra switched off', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.ENTRA_ENABLED;
    process.env.ENTRA_ENABLED = 'false';
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.ENTRA_ENABLED;
    } else {
      process.env.ENTRA_ENABLED = saved;
    }
  });

  test('sign_in_should_say_it_is_unavailable_rather_than_go_to_entra', async () => {
    await request(app)
      .get('/sign-in')
      .expect(res => {
        expect(res.status).to.equal(503);
        expect(res.text).to.contain('Sign in is not available at the moment');
      });
  });

  test('a_callback_should_not_sign_anyone_in', async () => {
    const agent = request.agent(app);

    await agent.get('/auth/callback?code=anything&state=anything').expect(res => expect(res.status).to.equal(503));
    await agent.get('/account').expect(res => expect(res.headers.location).to.equal('/sign-in'));
  });

  test('sign_out_should_go_home_rather_than_to_entra', async () => {
    await request(app)
      .post('/sign-out')
      .expect(res => {
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/');
      });
  });
});
