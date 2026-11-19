import { GET, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn } from '../modules/session';
import { isAdmin } from '../services/SignIn';

@route('/admin')
export default class AdminController {
  /** Anyone signed in who is not an admin gets the app's own not found page. */
  @GET()
  public get(req: AppRequest, res: Response, next: NextFunction): void {
    if (!requireSignIn(req, res)) {
      return;
    }

    if (!isAdmin(req.session.user)) {
      next();
      return;
    }

    res.render('admin');
  }
}
