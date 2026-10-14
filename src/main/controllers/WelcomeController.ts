import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn, takeReturnTo } from '../modules/session';
import { saveProfile } from '../services/Profiles';
import { SignedInUser } from '../services/SignIn';
import { FieldError, toAnswerList } from '../services/answers';

/**
 * First sign in: before going any further the user agrees to the guidelines for using HMCTS
 * APIs. Shown once — after that, sign in goes straight on.
 */
@route('/account/welcome')
export default class WelcomeController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.render('account/welcome', this.formData(req.session.user as SignedInUser, []));
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (!toAnswerList(body.agree).includes('yes')) {
      const errors = [{ name: 'agree', text: 'Confirm that you have read and agree to the guidelines' }];
      res.status(400).render('account/welcome', this.formData(user, errors));
      return;
    }

    await saveProfile(user.oid as string, { onboardedAt: new Date().toISOString() });

    // The welcome interrupted the way somewhere, or the user came straight from sign in
    // with nowhere in mind — in which case their applications are the place to start.
    const next = takeReturnTo(req, '/account/applications');
    req.session.save(() => res.redirect(next === '/account' ? '/account/applications' : next));
  }

  private formData(user: SignedInUser, errors: FieldError[]): Record<string, unknown> {
    return {
      profile: user,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
    };
  }
}
