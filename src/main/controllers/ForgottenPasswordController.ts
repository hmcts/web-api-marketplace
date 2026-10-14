import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

/**
 * Passwords are reset from the "Forgot password?" link on Microsoft Entra's sign-in page,
 * so this goes to sign in. Kept as an address so links and bookmarks still work.
 */
@route('/forgotten-password')
export default class ForgottenPasswordController {
  @GET()
  public get(_req: AppRequest, res: Response): void {
    res.redirect('/sign-in');
  }
}
