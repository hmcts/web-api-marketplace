import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

@route('/account')
export default class AccountController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!req.session?.user) {
      res.redirect('/sign-in');
      return;
    }

    res.render('account', {
      ...req.i18n?.getDataByLanguage(req.lng)?.account,
      user: req.session.user,
    });
  }
}
