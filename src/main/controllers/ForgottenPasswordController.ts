import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { startPasswordReset } from '../services/Accounts';
import { sendEmail } from '../services/Notify';
import { looksLikeAnEmailAddress, toAnswerText } from '../services/answers';

/**
 * "Forgotten your password?": an address in, a reset link out by email.
 *
 * The page that follows says the same thing whether or not the address has an account,
 * so it cannot be used to discover who is registered. Accounts held by the backend have no
 * password here to reset — its /login does not check one — so they get no email either.
 */
@route('/forgotten-password')
export default class ForgottenPasswordController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    res.render('password/forgotten', { email: '' });
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    const email = toAnswerText(req.body as Record<string, unknown>, 'email');

    if (!email || !looksLikeAnEmailAddress(email)) {
      res.status(400).render('password/forgotten', {
        email,
        error: email
          ? 'Enter an email address in the correct format, like name@example.com'
          : 'Enter your email address',
      });
      return;
    }

    const token = await startPasswordReset(email);

    req.session.emailSentTo = email;
    req.session.outbox = token
      ? sendEmail({
          template: 'reset-password',
          to: email,
          subject: 'Reset your password – HMCTS API Marketplace',
          paragraphs: [
            'We received a request to reset the password for your HMCTS API Marketplace account.',
            'The link expires in 1 hour. If you did not ask to reset your password, you can ignore this email.',
          ],
          link: { text: 'Reset your password', href: `/reset-password?token=${encodeURIComponent(token)}` },
        })
      : undefined;

    req.session.save(() => res.redirect('/forgotten-password/check-email'));
  }

  @route('/check-email')
  @GET()
  public checkEmail(req: AppRequest, res: Response): void {
    if (!req.session?.emailSentTo) {
      res.redirect('/forgotten-password');
      return;
    }
    res.render('password/check-email', { address: req.session.emailSentTo, outbox: req.session.outbox });
  }
}
