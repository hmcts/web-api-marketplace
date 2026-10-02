import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { findAccount, issueVerificationToken, verifyEmail } from '../services/Accounts';
import { sendEmail } from '../services/Notify';
import { looksLikeAnEmailAddress, toAnswerText } from '../services/answers';

/**
 * The link in the "confirm your email address" email, and sending that email again.
 *
 * GET, because it is followed from an email client. A link scanner that fetches it first
 * would use the token up — a known cost of single-use links that Notify-based services
 * accept, and the reason the expired page offers to send a new one.
 */
@route('/verify-email')
export default class VerifyEmailController {
  @GET()
  public async verify(req: AppRequest, res: Response): Promise<void> {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const account = await verifyEmail(token);

    if (!account) {
      res.status(400).render('register/link-expired');
      return;
    }

    sendEmail({
      template: 'email-verified',
      to: account.email,
      subject: 'Your account is ready – HMCTS API Marketplace',
      paragraphs: [`Dear ${account.firstName},`, 'Your email address is confirmed. You can now sign in.'],
      link: { text: 'Sign in', href: '/sign-in' },
    });
    res.render('register/verified', { firstName: account.firstName });
  }

  @route('/resend')
  @GET()
  public resendForm(req: AppRequest, res: Response): void {
    res.render('register/resend', { email: req.session?.emailSentTo ?? '' });
  }

  /** Sends a new link only to an unverified account, but says the same thing every time. */
  @route('/resend')
  @POST()
  public async resend(req: AppRequest, res: Response): Promise<void> {
    const email = toAnswerText(req.body as Record<string, unknown>, 'email');

    if (!looksLikeAnEmailAddress(email)) {
      res.status(400).render('register/resend', {
        email,
        error: 'Enter an email address in the correct format, like name@example.com',
      });
      return;
    }

    const account = await findAccount(email);

    req.session.emailSentTo = email;
    req.session.outbox =
      account && !account.verified
        ? sendEmail({
            template: 'verify-email',
            to: account.email,
            subject: 'Confirm your email address – HMCTS API Marketplace',
            paragraphs: [
              `Dear ${account.firstName},`,
              'Confirm your email address to finish creating your HMCTS API Marketplace developer account.',
              'The link expires in 24 hours.',
            ],
            link: {
              text: 'Confirm your email address',
              href: `/verify-email?token=${encodeURIComponent(await issueVerificationToken(account.email))}`,
            },
          })
        : undefined;

    req.session.save(() => res.redirect('/register/check-email'));
  }
}
