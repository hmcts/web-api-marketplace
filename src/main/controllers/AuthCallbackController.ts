import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { entraConfig } from '../modules/entra/config';
import { Logger } from '../modules/logging';
import { AMP_ADMIN } from '../services/AdminRole';
import { EntraClaims, ExchangedTokens, exchangeCodeForTokens, expiryOf, verifiedClaims } from '../services/Entra';
import { EntraUser, saveEntraUser } from '../services/EntraUsers';
import { toSignedInUser } from '../services/Profiles';
import { recordSignInFailure } from '../services/SecurityEvents';

import { SignInProblem, short, signInProblem } from './SignInController';

const logger = Logger.getLogger('sign-in');

/**
 * Entra sends the browser back here with a single-use code, or with an error. The code is
 * swapped for an ID token server to server, and the token verified, before anything in it
 * is believed. Then the user is saved in the backend and the session starts as them.
 *
 * Nothing logged here carries the code or the token: the code is logged as present or
 * missing, and only the claims read out of a verified token are logged at all.
 */
@route('/auth/callback')
export default class AuthCallbackController {
  @GET()
  public async get(req: AppRequest, res: Response): Promise<void> {
    const { code, state, error, error_description: errorDescription } = req.query as Record<string, string | undefined>;
    if (!entraConfig.enabled) {
      // Nothing can have been started with Entra, so there is nothing to finish.
      this.problem(req, res, 503, 'unavailable');
      return;
    }

    const started = req.session?.entraSignIn;
    delete req.session?.entraSignIn;

    logger.info(
      `Back from Entra  code=${code ? 'present' : 'MISSING'}  state=${state ? short(state) : 'MISSING'}  error=${error || 'none'}`
    );

    if (error) {
      // Most often the user chose to go back rather than sign in.
      logger.info(`Entra refused: ${error} - ${errorDescription || '(no description)'}`);
      recordSignInFailure('cancelled');
      this.problem(req, res, 400, 'cancelled');
      return;
    }
    if (!state || !started || state !== started.state || !code) {
      // A callback this browser did not start: a forged link, or a sign in started in
      // another tab or before the session expired.
      logger.error(
        `State mismatch  query=${state ? short(state) : 'MISSING'}  session=${started ? short(started.state) : 'MISSING'}`
      );
      recordSignInFailure('state_mismatch');
      this.problem(req, res, 400, 'expired');
      return;
    }

    let tokens: ExchangedTokens;
    try {
      tokens = await exchangeCodeForTokens(code, started.codeVerifier);
    } catch (err) {
      logger.error(`Token exchange failed: ${(err as Error).message}`);
      recordSignInFailure('token_exchange_failed');
      this.problem(req, res, 502, 'unavailable');
      return;
    }

    let claims: EntraClaims;
    try {
      claims = await verifiedClaims(tokens.idToken, started.nonce);
    } catch (err) {
      logger.error(`ID token rejected: ${(err as Error).message}`);
      recordSignInFailure('token_rejected');
      this.problem(req, res, 401, 'rejected');
      return;
    }

    let user: EntraUser;
    try {
      user = await saveEntraUser(claims);
    } catch (err) {
      logger.error(`Could not save the user  oid=${claims.oid}: ${(err as Error).message}`);
      recordSignInFailure('user_not_saved');
      this.problem(req, res, 503, 'unavailable');
      return;
    }

    logger.info(`Signed in  oid=${claims.oid}  userId=${user.id}  admin=${claims.roles?.includes(AMP_ADMIN) === true}`);
    startSession(req, res, claims, user, tokens);
  }

  private problem(req: AppRequest, res: Response, status: number, problem: SignInProblem): void {
    signInProblem(req, res, status, problem);
  }
}

/**
 * Shared with the Entra bypass, so both regenerate the session id the same way. The bypass
 * passes no tokens, having asked Entra for nothing.
 */
export function startSession(
  req: AppRequest,
  res: Response,
  claims: EntraClaims,
  user: EntraUser,
  tokens?: ExchangedTokens
): void {
  req.session.regenerate(error => {
    if (error) {
      logger.error(`Could not start a session: ${error.message}`);
      recordSignInFailure('session_not_started');
      signInProblem(req, res, 500, 'unavailable');
      return;
    }

    req.session.user = toSignedInUser(claims, user.id, user.userReference);
    req.session.idToken = tokens?.idToken;
    req.session.refreshToken = tokens?.refreshToken;
    req.session.idTokenExpiresAt = tokens && expiryOf(tokens.idToken);
    // Every sign in lands on the account page, whichever page asked for it.
    req.session.save(() => res.redirect('/account'));
  });
}
