import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { signIn } from '../services/SignIn';

@route('/sign-in')
export default class SignInController {
  @GET()
  public get(req: AppRequest, res: Response): void {
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

    if (!result.ok) {
      // Deliberately the same message whether the account is unknown or the password is
      // wrong, so the page cannot be used to discover which addresses are registered.
      res.status(401).render('sign-in', { ...content, error: content?.errorRejected as string, email });
      return;
    }

    res.redirect('/');
  }
}
