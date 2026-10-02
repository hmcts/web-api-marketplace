import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { isResetTokenValid, resetPassword, validatePassword } from '../services/Accounts';

/** The link in the "reset your password" email: a new password, then sign in with it. */
@route('/reset-password')
export default class ResetPasswordController {
  @GET()
  public async get(req: AppRequest, res: Response): Promise<void> {
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    if (!(await isResetTokenValid(token))) {
      res.status(400).render('password/link-expired');
      return;
    }
    res.render('password/reset', { token, errors: [], errorFor: {} });
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmation = typeof body['password-confirm'] === 'string' ? body['password-confirm'] : '';

    if (!(await isResetTokenValid(token))) {
      res.status(400).render('password/link-expired');
      return;
    }

    const error = validatePassword(password, confirmation);
    if (error) {
      const name = error.includes('match') ? 'password-confirm' : 'password';
      res.status(400).render('password/reset', {
        token,
        errors: [{ name, text: error }],
        errorFor: { [name]: error },
      });
      return;
    }

    if (!(await resetPassword(token, password))) {
      res.status(400).render('password/link-expired');
      return;
    }
    res.render('password/changed');
  }
}
