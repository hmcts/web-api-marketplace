import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';

import { expiryOf, refreshTokens, refreshedClaims } from './Entra';

const logger = Logger.getLogger('token-refresh');

/** Renew this long before the token expires, so a request in flight does not cross the line. */
const RENEW_WITHIN_SECONDS = 120;

/** What a renewal leaves on the session, whether it worked or not. */
interface Renewed {
  idToken?: string;
  refreshToken?: string;
  idTokenExpiresAt?: number;
  roles?: string[];
}

/** Nothing: the session keeps the person signed in and loses only what it cannot prove. */
const NOTHING: Renewed = {};

/**
 * One renewal per session at a time, by session id. A page load fires many requests at once and
 * Entra spends a refresh token on first use, so without this the first request would succeed and
 * the rest would be refused for reusing a token that no longer exists - and take a working
 * session down with them. Each waiting request writes the same result to its own copy of the
 * session, because express-session loaded one per request and saves whichever finishes last.
 *
 * Per pod, so two pods can still renew the same session twice. That costs a rotation, not a
 * session, and the alternative is a lock in Redis for a problem this size.
 */
const inFlight = new Map<string, Promise<Renewed>>();

/**
 * Keeps the session's ID token usable for as long as the person keeps using the site. Entra
 * issues an ID token good for about an hour and a refresh token good for far longer, so without
 * this a session stops being able to prove anything to the API while the person is still here.
 *
 * A refresh also re-reads the directory, so losing the admin role takes effect within the
 * renewal window rather than at the end of the token's life.
 */
export async function refreshExpiringToken(req: AppRequest): Promise<void> {
  const session = req.session;
  if (!session?.user || !session.refreshToken || !dueFor(session.idTokenExpiresAt)) {
    return;
  }

  const sessionId = req.sessionID;
  let renewal = inFlight.get(sessionId);
  if (!renewal) {
    renewal = renew(session.refreshToken, session.user.oid).finally(() => inFlight.delete(sessionId));
    inFlight.set(sessionId, renewal);
  }

  const renewed = await renewal;
  session.idToken = renewed.idToken;
  session.refreshToken = renewed.refreshToken;
  session.idTokenExpiresAt = renewed.idTokenExpiresAt;
  if (session.user) {
    session.user = { ...session.user, roles: renewed.roles };
  }
}

/**
 * The refreshed token is verified like any other: one that came from a refresh is not better for
 * having done so. A failure leaves the session without a token and without the roles that went
 * with it - the person keeps the page they are on, and anything needing a token is refused rather
 * than offered and then broken.
 */
async function renew(refreshToken: string, expectedOid: string | undefined): Promise<Renewed> {
  try {
    const tokens = await refreshTokens(refreshToken);
    const claims = await refreshedClaims(tokens.idToken);

    if (expectedOid && claims.oid !== expectedOid) {
      // Entra binds a refresh token to the person it was issued for, so this should be
      // impossible. If it ever happens, adopting the roles would hand them this session.
      throw new Error(`refreshed as ${claims.oid}, which is not who this session signed in as`);
    }

    logger.info(`Refreshed the ID token  oid=${claims.oid}`);
    return {
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
      idTokenExpiresAt: expiryOf(tokens.idToken),
      roles: claims.roles,
    };
  } catch (error) {
    logger.error(`Could not refresh the ID token: ${(error as Error).message}`);
    return NOTHING;
  }
}

/** No expiry recorded means a session from before this was kept: refresh it and find out. */
function dueFor(expiresAt: number | undefined): boolean {
  return expiresAt === undefined || expiresAt - Math.floor(Date.now() / 1000) <= RENEW_WITHIN_SECONDS;
}
