import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { takeReturnTo } from '../modules/session';
import { authenticate, isOnboarded } from '../services/Accounts';
import { SignedInUser, signIn } from '../services/SignIn';

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

  /**
   * Accounts registered through this service are checked first, then the backend's. An
   * address registered here is never also tried against the backend, so a wrong password
   * for it is refused here rather than waved through by the backend's stub /login, which
   * does not check passwords at all.
   */
  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    const content = req.i18n?.getDataByLanguage(req.lng)?.signIn as Record<string, unknown>;
    const email = String(req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).render('sign-in', { ...content, error: content?.errorMissing as string, email });
      return;
    }

    const local = await authenticate(email, password);

    if (local.status === 'unverified') {
      res.status(401).render('sign-in', { ...content, unverified: true, email });
      return;
    }
    if (local.status === 'rejected') {
      res.status(401).render('sign-in', { ...content, error: content?.errorRejected as string, email });
      return;
    }
    if (local.status === 'ok') {
      await this.startSession(req, res, local.user, content, email);
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

    if (!result.ok || !result.user) {
      // Deliberately the same message whether the account is unknown or the password is
      // wrong, so the page cannot be used to discover which addresses are registered.
      res.status(401).render('sign-in', { ...content, error: content?.errorRejected as string, email });
      return;
    }

    await this.startSession(req, res, result.user, content, email);
  }

  private async startSession(
    req: AppRequest,
    res: Response,
    user: SignedInUser,
    content: Record<string, unknown>,
    email: string
  ): Promise<void> {
    // Read before regenerating, which starts an empty session.
    const returnTo = takeReturnTo(req, '/account');
    const onboarded = await isOnboarded(user.email);

    // A new session id on sign in, so a session id an attacker planted before the user
    // signed in cannot be used afterwards.
    req.session.regenerate(error => {
      if (error) {
        res.status(500).render('sign-in', { ...content, error: content?.errorRejected as string, email });
        return;
      }

      req.session.user = user;
      // First sign in goes through the welcome page, which then carries on to wherever
      // sign in interrupted.
      req.session.returnTo = returnTo;
      req.session.save(() => res.redirect(onboarded ? takeReturnTo(req, '/account') : '/account/welcome'));
    });
  }
}
