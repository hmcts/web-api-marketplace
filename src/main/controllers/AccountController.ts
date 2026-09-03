import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { getSubscriptionsFor } from '../services/Subscriptions';

@route('/account')
export default class AccountController {
  @GET()
  public async get(req: AppRequest, res: Response): Promise<void> {
    if (!req.session?.user) {
      res.redirect('/sign-in');
      return;
    }

    const requests = await getSubscriptionsFor(req.session.user.email);

    res.render('account', {
      ...req.i18n?.getDataByLanguage(req.lng)?.account,
      user: req.session.user,
      subscriptions: requests.subscriptions,
      // Told apart on the page: having submitted nothing is not the same as being unable
      // to find out, and only one of them is the user's own doing.
      couldNotLoad: !requests.ok,
    });
  }
}
