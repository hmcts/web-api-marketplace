import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';

import { expiryOf, refreshTokens, refreshedClaims } from './Entra';

const logger = Logger.getLogger('token-refresh');

/** Renew this long before the token expires, so a request in flight does not cross the line. */
const RENEW_WITHIN_SECONDS = 120;

/**
 * Keeps the session's ID token usable for as long as the person keeps using the site.
 *
 * Entra issues an ID token good for about an hour and a refresh token good for far longer, so
 * without this a session stops being able to prove anything to the API after an hour even though
 * the person is still here. The refreshed token is verified like any other: a token this service
 * has not checked is not better for having come from a refresh.
 *
 * A refresh also re-reads the directory, so losing the admin role takes effect within the renewal
 * window rather than at the end of the token's life.
 */
export async function refreshExpiringToken(req: AppRequest): Promise<void> {
  const session = req.session;
  if (!session?.user || !session.refreshToken || !dueFor(session.idTokenExpiresAt)) {
    return;
  }

  try {
    const tokens = await refreshTokens(session.refreshToken);
    const claims = await refreshedClaims(tokens.idToken);

    session.idToken = tokens.idToken;
    session.refreshToken = tokens.refreshToken ?? session.refreshToken;
    session.idTokenExpiresAt = expiryOf(tokens.idToken);
    session.user = { ...session.user, roles: claims.roles };
    logger.info(`Refreshed the ID token  oid=${claims.oid}`);
  } catch (error) {
    // The session stays, without a token: the person keeps their page, and the API answers 401
    // to anything that needed one. Signing them out mid-request would lose whatever they typed.
    logger.error(`Could not refresh the ID token: ${(error as Error).message}`);
    session.idToken = undefined;
    session.refreshToken = undefined;
    session.idTokenExpiresAt = undefined;
  }
}

/** No expiry recorded means a session from before this was kept: refresh it and find out. */
function dueFor(expiresAt: number | undefined): boolean {
  return expiresAt === undefined || expiresAt - Math.floor(Date.now() / 1000) <= RENEW_WITHIN_SECONDS;
}
