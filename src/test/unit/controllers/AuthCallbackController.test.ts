import AuthCallbackController from '../../../main/controllers/AuthCallbackController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { saveProfile } from '../../../main/services/Profiles';
import { ADA, StubEntra, codeFor, startStubEntra } from '../../stubs/entra';
import { anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

const STARTED = { state: 'the-state', nonce: 'the-nonce' };

let entra: StubEntra;

beforeAll(async () => {
  entra = await startStubEntra();
});

afterAll(() => entra.close());

/** Back from Entra, in a browser whose session started this sign in. */
const backFromEntra = (query: Record<string, string>, session: Record<string, unknown> = { entraSignIn: STARTED }) =>
  anonymous({ query, session });

const callback = async (req = backFromEntra({ code: codeFor(ADA, STARTED.nonce), state: STARTED.state })) => {
  const res = mockResponse();
  await new AuthCallbackController().get(req, res);
  return { req, res };
};

describe('AuthCallbackController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));
  afterEach(() => entra.reset());

  test('a_first_sign_in_should_start_a_session_as_the_entra_user_and_go_to_the_welcome', async () => {
    const { req, res } = await callback();

    expect(res.redirected).toBe('/account/welcome');
    expect(req.session.user).toEqual({
      id: 0,
      local: true,
      oid: ADA.oid,
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  test('a_later_sign_in_should_skip_the_welcome', async () => {
    await saveProfile(ADA.oid, { onboardedAt: 'then' });

    const { res } = await callback();

    expect(res.redirected).toBe('/account');
  });

  test('a_later_sign_in_should_return_to_the_page_that_asked_for_it', async () => {
    await saveProfile(ADA.oid, { onboardedAt: 'then' });

    const { res } = await callback(
      backFromEntra(
        { code: codeFor(ADA, STARTED.nonce), state: STARTED.state },
        { entraSignIn: STARTED, returnTo: '/account/applications/new' }
      )
    );

    expect(res.redirected).toBe('/account/applications/new');
  });

  test('the_sign_in_should_be_used_up_so_the_same_callback_cannot_be_replayed', async () => {
    const { req } = await callback();

    expect(req.session.entraSignIn).toBeUndefined();
  });

  test('cancelling_on_entra_should_say_so_without_signing_in', async () => {
    const { req, res } = await callback(backFromEntra({ error: 'access_denied', error_description: 'cancelled' }));

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('sign-in');
    expect(res.data?.problem).toBe('cancelled');
    expect(req.session.user).toBeUndefined();
  });

  test.each([
    ['a_state_that_does_not_match', { code: 'x', state: 'forged' }, { entraSignIn: STARTED }],
    ['no_sign_in_started_in_this_browser', { code: 'x', state: STARTED.state }, {}],
    ['no_state_at_all', { code: 'x' }, { entraSignIn: STARTED }],
    ['no_code', { state: STARTED.state }, { entraSignIn: STARTED }],
  ])('%s_should_be_refused_as_expired', async (_name, query, session) => {
    const { req, res } = await callback(backFromEntra(query as Record<string, string>, session));

    expect(res.statusCode).toBe(400);
    expect(res.data?.problem).toBe('expired');
    expect(req.session.user).toBeUndefined();
  });

  test('entra_failing_to_swap_the_code_should_be_reported_as_an_outage', async () => {
    entra.failTokenRequests(503);

    const { req, res } = await callback();

    expect(res.statusCode).toBe(502);
    expect(res.data?.problem).toBe('unavailable');
    expect(req.session.user).toBeUndefined();
  });

  test('a_token_that_cannot_be_trusted_should_not_sign_anyone_in', async () => {
    entra.answerTokenRequestsWith(claims => entra.idToken(claims, 'from-another-sign-in'));

    const { req, res } = await callback();

    expect(res.statusCode).toBe(401);
    expect(res.data?.problem).toBe('rejected');
    expect(req.session.user).toBeUndefined();
  });
});
