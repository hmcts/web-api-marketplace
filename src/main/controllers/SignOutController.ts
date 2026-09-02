import { POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';

const logger = Logger.getLogger('sign-out');

/**
 * POST rather than GET: signing out changes state, and a GET would let any page — or a
 * link prefetcher — sign the user out by linking to it.
 */
@route('/sign-out')
export default class SignOutController {
  @POST()
  public post(req: AppRequest, res: Response): void {
    req.session?.destroy(error => {
      if (error) {
        logger.error(`Could not destroy the session on sign out: ${error.message}`);
      }
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  }
}
