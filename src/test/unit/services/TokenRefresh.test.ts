import { randomUUID } from 'node:crypto';

import { AppRequest } from '../../../main/interfaces/AppRequest';
import { AMP_ADMIN } from '../../../main/services/AdminRole';
import { exchangeCodeForTokens, expiryOf, newPkce } from '../../../main/services/Entra';
import { refreshExpiringToken } from '../../../main/services/TokenRefresh';
import { ADA, StubEntra, codeFor, startStubEntra } from '../../stubs/entra';

let entra: StubEntra;

beforeAll(async () => {
  entra = await startStubEntra();
});

afterAll(() => entra.close());
afterEach(() => entra.reset());

/** A session as sign in leaves it, with the expiry a test wants to pretend the token has. */
const signedIn = async (expiresAt?: number, sessionId = randomUUID()): Promise<AppRequest> => {
  const pkce = newPkce();
  const tokens = await exchangeCodeForTokens(codeFor(ADA, 'n1', pkce.challenge), pkce.verifier);
  return {
    sessionID: sessionId,
    session: {
      user: { id: 1, oid: ADA.oid, email: ADA.email, name: ADA.name, roles: [AMP_ADMIN] },
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      idTokenExpiresAt: expiresAt ?? expiryOf(tokens.idToken),
    },
  } as unknown as AppRequest;
};

const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

describe('refreshExpiringToken', () => {
  test('a_token_close_to_expiry_should_be_renewed_and_its_refresh_token_rotated', async () => {
    const req = await signedIn(inSeconds(30));
    const before = { idToken: req.session.idToken, refreshToken: req.session.refreshToken };

    await refreshExpiringToken(req);

    expect(req.session.idToken).toBeDefined();
    expect(req.session.idToken).not.toBe(before.idToken);
    expect(req.session.refreshToken).not.toBe(before.refreshToken);
    expect(req.session.idTokenExpiresAt).toBeGreaterThan(inSeconds(60));
  });

  test('a_token_with_time_left_should_be_left_alone', async () => {
    const req = await signedIn(inSeconds(3600));
    const before = req.session.idToken;

    await refreshExpiringToken(req);

    expect(req.session.idToken).toBe(before);
  });

  test('a_session_with_no_recorded_expiry_should_be_renewed_rather_than_guessed_at', async () => {
    const req = await signedIn();
    req.session.idTokenExpiresAt = undefined;
    const before = req.session.idToken;

    await refreshExpiringToken(req);

    expect(req.session.idToken).not.toBe(before);
  });

  test('a_refresh_the_tenant_refuses_should_leave_the_session_without_a_token', async () => {
    const req = await signedIn(inSeconds(30));
    req.session.refreshToken = 'a-token-this-tenant-never-issued';

    await refreshExpiringToken(req);

    expect(req.session.idToken).toBeUndefined();
    expect(req.session.refreshToken).toBeUndefined();
    expect(req.session.idTokenExpiresAt).toBeUndefined();
  });

  test('a_refresh_that_fails_should_take_the_roles_with_the_token', async () => {
    const req = await signedIn(inSeconds(30));
    req.session.refreshToken = 'a-token-this-tenant-never-issued';

    await refreshExpiringToken(req);

    expect(req.session.user?.roles).toBeUndefined();
  });

  test('a_token_refreshed_as_someone_else_should_be_refused_rather_than_adopted', async () => {
    const req = await signedIn(inSeconds(30));
    req.session.user = { ...req.session.user, oid: 'a-different-person' } as typeof req.session.user;

    await refreshExpiringToken(req);

    expect(req.session.idToken).toBeUndefined();
    expect(req.session.user?.roles).toBeUndefined();
  });

  test('requests_arriving_together_should_share_one_renewal_rather_than_race_it', async () => {
    const sessionId = randomUUID();
    const first = await signedIn(inSeconds(30), sessionId);
    const alongside = [1, 2, 3].map(() => ({ ...first, session: { ...first.session } }) as AppRequest);

    await Promise.all([first, ...alongside].map(refreshExpiringToken));

    // One rotation between them: a second would have spent a token Entra had already retired,
    // and the failure would have cleared a session that had just been renewed.
    for (const req of [first, ...alongside]) {
      expect(req.session.idToken).toBeDefined();
      expect(req.session.refreshToken).toBe(first.session.refreshToken);
    }
  });

  test('a_role_granted_since_sign_in_should_be_read_from_the_refreshed_token', async () => {
    const req = await signedIn(inSeconds(30));
    entra.admins.add(ADA.oid);

    await refreshExpiringToken(req);

    expect(req.session.user?.roles).toEqual([AMP_ADMIN]);
  });

  test('a_signed_out_visitor_should_be_passed_over_without_error', async () => {
    const req = { session: {} } as unknown as AppRequest;

    await expect(refreshExpiringToken(req)).resolves.toBeUndefined();
  });
});
