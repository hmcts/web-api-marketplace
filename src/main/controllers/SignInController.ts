import crypto from 'node:crypto';

import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { authorizeUrl, isEntraPrompt } from '../services/Entra';

const logger = Logger.getLogger('sign-in');

/**
 * Starts a sign in by sending the browser to Microsoft Entra, which shows the sign-in,
 * create-account and forgotten-password pages. Entra sends the browser back to
 * /auth/callback (AuthCallbackController) when it is done.
 *
 * `?prompt=create` opens Entra on its create-account form, for the "Create a developer
 * account" links.
 */
@route('/sign-in')
export default class SignInController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (req.session?.user) {
      res.redirect('/account');
      return;
    }

    // The CSRF defence for the round trip. Anyone can send a browser to /auth/callback,
    // so the session is what proves this browser is the one that started this sign in.
    const state = crypto.randomBytes(16).toString('hex');
    // Entra copies the nonce into the ID token, which ties that token to this sign in.
    const nonce = crypto.randomBytes(16).toString('hex');
    const prompt = isEntraPrompt(req.query.prompt) ? req.query.prompt : undefined;

    req.session.entraSignIn = { state, nonce };
    logger.info(`Redirecting to Entra  state=${short(state)}  prompt=${prompt ?? 'none'}`);
    req.session.save(() => res.redirect(authorizeUrl(state, nonce, prompt)));
  }
}

/** Enough of a random value to follow it through the log, not enough to replay it. */
export function short(value: string): string {
  return `${value.slice(0, 8)}...`;
}
