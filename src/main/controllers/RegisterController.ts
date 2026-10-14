import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

/**
 * Accounts are created on Microsoft Entra's create-account page, which sign in opens with
 * `prompt=create`. Kept as an address so links and bookmarks to /register still work.
 */
@route('/register')
export default class RegisterController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    res.redirect(req.session?.user ? '/account' : '/sign-in?prompt=create');
  }
}
