import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { entraConfig } from '../modules/entra/config';
import { Logger } from '../modules/logging';
import { takeReturnTo } from '../modules/session';
import { EntraClaims, exchangeCodeForIdToken, verifiedClaims } from '../services/Entra';
import { findProfile, toSignedInUser } from '../services/Profiles';

import { SignInProblem, short, signInProblem } from './SignInController';

const logger = Logger.getLogger('sign-in');

/**
 * Entra sends the browser back here with a single-use code, or with an error. The code is
 * swapped for an ID token server to server, and the token verified, before anything in it
 * is believed. Then the session starts, as the user Entra says they are.
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
      this.problem(req, res, 400, 'cancelled');
      return;
    }
    if (!state || !started || state !== started.state || !code) {
      // A callback this browser did not start: a forged link, or a sign in started in
      // another tab or before the session expired.
      logger.error(
        `State mismatch  query=${state ? short(state) : 'MISSING'}  session=${started ? short(started.state) : 'MISSING'}`
      );
      this.problem(req, res, 400, 'expired');
      return;
    }

    let idToken: string;
    try {
      idToken = await exchangeCodeForIdToken(code);
    } catch (err) {
      logger.error(`Token exchange failed: ${(err as Error).message}`);
      this.problem(req, res, 502, 'unavailable');
      return;
    }

    let claims: EntraClaims;
    try {
      claims = await verifiedClaims(idToken, started.nonce);
    } catch (err) {
      logger.error(`ID token rejected: ${(err as Error).message}`);
      this.problem(req, res, 401, 'rejected');
      return;
    }

    logger.info(`Signed in  oid=${claims.oid}`);
    await this.startSession(req, res, claims);
  }

  private async startSession(req: AppRequest, res: Response, claims: EntraClaims): Promise<void> {
    // Read before regenerating, which starts an empty session.
    const returnTo = takeReturnTo(req, '/account');
    const profile = await findProfile(claims.oid);

    // A new session id on sign in, so a session id an attacker planted before the user
    // signed in cannot be used afterwards.
    req.session.regenerate(error => {
      if (error) {
        logger.error(`Could not start a session: ${error.message}`);
        this.problem(req, res, 500, 'unavailable');
        return;
      }

      req.session.user = toSignedInUser(claims, profile);
      // First sign in goes through the welcome page, for the organisation and account type
      // Entra does not hold, then carries on to wherever sign in interrupted.
      req.session.returnTo = returnTo;
      req.session.save(() => res.redirect(profile ? takeReturnTo(req, '/account') : '/account/welcome'));
    });
  }

  private problem(req: AppRequest, res: Response, status: number, problem: SignInProblem): void {
    signInProblem(req, res, status, problem);
  }
}
