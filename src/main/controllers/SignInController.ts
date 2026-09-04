import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { signIn } from '../services/SignIn';

@route('/sign-in')
export default class SignInController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (req.session?.user) {
      res.redirect('/account');
      return;
    }
    res.render('sign-in', req.i18n?.getDataByLanguage(req.lng)?.signIn);
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    const content = req.i18n?.getDataByLanguage(req.lng)?.signIn as Record<string, unknown>;
    const email = String(req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).render('sign-in', { ...content, error: content?.errorMissing as string, email });
      return;
    }

    const result = await signIn(email, password);

    if (result.unavailable) {
      // 503 rather than 401: the credentials were never judged, so saying "unauthorised"
      // would be untrue to the user and to anything watching the logs. Reported as a
      // service error and not against the email field, because nothing they typed is
      // wrong and a red box round a valid address only misleads.
      res.status(503).render('sign-in', { ...content, serviceError: content?.errorUnavailable as string, email });
      return;
    }

    if (!result.ok) {
      // Deliberately the same message whether the account is unknown or the password is
      // wrong, so the page cannot be used to discover which addresses are registered.
      res.status(401).render('sign-in', { ...content, error: content?.errorRejected as string, email });
      return;
    }

    // A new session id on sign in, so a session id an attacker planted before the user
    // signed in cannot be used afterwards.
    req.session.regenerate(error => {
      if (error) {
        res.status(500).render('sign-in', { ...content, error: content?.errorRejected as string, email });
        return;
      }

      req.session.user = result.user;
      req.session.save(() => res.redirect('/account'));
    });
  }
}
