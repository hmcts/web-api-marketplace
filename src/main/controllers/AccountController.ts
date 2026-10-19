import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn } from '../modules/session';
import { SignedInUser } from '../services/SignIn';

@route('/account')
export default class AccountController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }

    res.render('account', {
      ...req.i18n?.getDataByLanguage(req.lng)?.account,
      user: req.session.user as SignedInUser,
    });
  }
}
