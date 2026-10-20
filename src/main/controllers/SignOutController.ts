import { POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { logoutUrl } from '../services/Entra';
import { entraBypass } from '../services/EntraBypass';

const logger = Logger.getLogger('sign-out');

/**
 * POST rather than GET: signing out changes state, and a GET would let any page — or a
 * link prefetcher — sign the user out by linking to it.
 *
 * Ends Entra's session as well as ours. Otherwise the next "Sign in" would go straight
 * through as the same person without asking — on a shared computer, as whoever used it
 * last. Entra then sends the browser back to the home page.
 *
 * With the Entra bypass on there is no Entra session to end, so it goes straight home.
 */
@route('/sign-out')
export default class SignOutController {
  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    const next = entraBypass.enabled ? '/' : await logoutUrl();

    req.session?.destroy(error => {
      if (error) {
        logger.error(`Could not destroy the session on sign out: ${error.message}`);
      }
      res.clearCookie('connect.sid');
      res.redirect(next);
    });
  }
}
