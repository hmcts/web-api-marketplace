import crypto from 'node:crypto';

import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { entraConfig } from '../modules/entra/config';
import { Logger } from '../modules/logging';
import { authorizeUrl, isEntraPrompt, newPkce } from '../services/Entra';

const logger = Logger.getLogger('sign-in');

/**
 * Starts a sign in by sending the browser to Microsoft Entra, which shows the sign-in,
 * create-account and forgotten-password pages. Entra sends the browser back to
 * /auth/callback (AuthCallbackController) when it is done.
 *
 * `?prompt=create` opens Entra on its create-account form, for the "Create a developer
 * account" links.
 *
 * With sign in switched off (ENTRA_ENABLED=false) it says sign in is unavailable instead.
 */
@route('/sign-in')
export default class SignInController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (req.session?.user) {
      res.redirect('/account');
      return;
    }
    if (!entraConfig.enabled) {
      signInProblem(req, res, 503, 'unavailable');
      return;
    }

    // The CSRF defence for the round trip. Anyone can send a browser to /auth/callback,
    // so the session is what proves this browser is the one that started this sign in.
    const state = crypto.randomBytes(16).toString('hex');
    // Entra copies the nonce into the ID token, which ties that token to this sign in.
    const nonce = crypto.randomBytes(16).toString('hex');
    const pkce = newPkce();
    const prompt = isEntraPrompt(req.query.prompt) ? req.query.prompt : undefined;

    req.session.entraSignIn = { state, nonce, codeVerifier: pkce.verifier };
    logger.info(`Redirecting to Entra  state=${short(state)}  prompt=${prompt ?? 'none'}`);
    req.session.save(() => res.redirect(authorizeUrl(state, nonce, pkce.challenge, prompt)));
  }
}

/** Enough of a random value to follow it through the log, not enough to replay it. */
export function short(value: string): string {
  return `${value.slice(0, 8)}...`;
}

export type SignInProblem = 'cancelled' | 'expired' | 'unavailable' | 'rejected';

/** The sign-in page, saying why the user is not signed in (see views/sign-in.njk). */
export function signInProblem(req: AppRequest, res: Response, status: number, problem: SignInProblem): void {
  const content = req.i18n?.getDataByLanguage(req.lng)?.signIn as Record<string, unknown> | undefined;
  res.status(status).render('sign-in', { ...content, problem });
}
