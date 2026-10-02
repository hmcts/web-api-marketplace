import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn, takeReturnTo } from '../modules/session';
import { markOnboarded } from '../services/Accounts';
import { SignedInUser } from '../services/SignIn';
import { toAnswerList } from '../services/answers';

/**
 * First sign in: the user checks the profile their account was created with and agrees to
 * the guidelines for using HMCTS APIs before going any further. Shown once — after that,
 * sign in goes straight on.
 */
@route('/account/welcome')
export default class WelcomeController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.render('account/welcome', { profile: req.session.user as SignedInUser });
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const agreed = toAnswerList((req.body as Record<string, unknown>)?.agree).includes('yes');

    if (!agreed) {
      res.status(400).render('account/welcome', {
        profile: user,
        error: 'Confirm that you have read and agree to the guidelines',
      });
      return;
    }

    await markOnboarded(user.email);
    // The welcome interrupted the way somewhere, or the user came straight from sign in
    // with nowhere in mind — in which case their applications are the place to start.
    const next = takeReturnTo(req, '/account/applications');
    req.session.save(() => res.redirect(next === '/account' ? '/account/applications' : next));
  }
}
