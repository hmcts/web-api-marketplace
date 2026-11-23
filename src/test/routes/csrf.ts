import { expect } from 'chai';

jest.mock('../../main/services/Requests', () => ({
  getRequestsFor: jest.fn().mockResolvedValue({ ok: true, requests: [] }),
}));

import { newAgent, signedInConsumer } from './helpers/consumer';

describe('CSRF protection', () => {
  test('every_form_on_a_signed_in_page_should_carry_the_token', async () => {
    const agent = await signedInConsumer('csrf-forms@example.com');

    const page = await agent.get('/account/applications/new/details').expect(200);

    expect(page.text).to.match(/name="_csrf" value="[A-Za-z0-9_-]{43}"/);
  });

  test('a_signed_in_post_with_the_token_should_be_accepted', async () => {
    const agent = await signedInConsumer('csrf-accepted@example.com');

    const res = await agent.post('/account/applications/new/details').type('form').send({ name: 'Case tracker' });

    expect(res.status).to.equal(302);
  });

  test('a_signed_in_post_without_the_token_should_be_refused', async () => {
    const agent = await signedInConsumer('csrf-missing@example.com');
    agent.set('X-CSRF-Token', '');

    const res = await agent.post('/account/applications/new/details').type('form').send({ name: 'Case tracker' });

    expect(res.status).to.equal(403);
  });

  test('a_signed_in_post_with_another_sessions_token_should_be_refused', async () => {
    const victim = await signedInConsumer('csrf-victim@example.com');
    const attacker = await signedInConsumer('csrf-attacker@example.com');
    const attackersToken = (await attacker.get('/account')).text.match(/name="_csrf" value="([^"]+)"/)?.[1] as string;
    victim.set('X-CSRF-Token', attackersToken);

    const res = await victim.post('/sign-out');

    expect(res.status).to.equal(403);
  });

  test('a_signed_out_post_should_still_be_sent_to_sign_in', async () => {
    const res = await newAgent().post('/account/applications/new/details').type('form').send({ name: 'Case tracker' });

    expect(res.status).to.equal(302);
    expect(res.headers.location).to.equal('/sign-in');
  });
});
