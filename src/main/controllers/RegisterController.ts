import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { AccountRole, register, validatePassword } from '../services/Accounts';
import { sendEmail } from '../services/Notify';
import { FieldError, looksLikeAnEmailAddress, toAnswerText } from '../services/answers';

const NAME_MAX_LENGTH = 100;

const ROLES = [
  { value: 'consumer', text: 'Consumer', hint: { text: 'Find and use existing APIs' } },
  { value: 'producer', text: 'Producer', hint: { text: 'List and manage my APIs' } },
];

/**
 * "Create a developer account": details and password, then "check your email", then the
 * link in that email confirms the address (VerifyEmailController).
 *
 * Whether or not the address already has an account, the visitor sees the same "check
 * your email" page. Only the email differs — "confirm your address" for a new account,
 * "you already have an account" for an existing one — so the form cannot be used to find
 * out who is registered.
 */
@route('/register')
export default class RegisterController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (req.session?.user) {
      res.redirect('/account');
      return;
    }
    res.render('register/index', this.formData({}, []));
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const answers = {
      'first-name': toAnswerText(body, 'first-name'),
      'last-name': toAnswerText(body, 'last-name'),
      email: toAnswerText(body, 'email'),
      organisation: toAnswerText(body, 'organisation'),
      role: toAnswerText(body, 'role'),
    };
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmation = typeof body['password-confirm'] === 'string' ? body['password-confirm'] : '';
    const errors = this.validate(answers, password, confirmation);

    if (errors.length) {
      res.status(400).render('register/index', this.formData(answers, errors));
      return;
    }

    const result = await register({
      firstName: answers['first-name'],
      lastName: answers['last-name'],
      email: answers.email,
      orgName: answers.organisation,
      role: answers.role as AccountRole,
      password,
    });

    req.session.emailSentTo = answers.email;
    req.session.outbox = result.created
      ? sendEmail({
          template: 'verify-email',
          to: answers.email,
          subject: 'Confirm your email address – HMCTS API Marketplace',
          paragraphs: [
            `Dear ${answers['first-name']},`,
            'Confirm your email address to finish creating your HMCTS API Marketplace developer account.',
            'The link expires in 24 hours. If you did not create an account, you can ignore this email.',
          ],
          link: { text: 'Confirm your email address', href: `/verify-email?token=${encodeURIComponent(result.token)}` },
        })
      : sendEmail({
          template: 'already-registered',
          to: answers.email,
          subject: 'You already have an account – HMCTS API Marketplace',
          paragraphs: [
            'Someone tried to create an HMCTS API Marketplace account with this email address, but you already have one.',
            'If it was you, sign in instead. If you have forgotten your password, you can reset it from the sign in page.',
          ],
          link: { text: 'Sign in', href: '/sign-in' },
        });

    req.session.save(() => res.redirect('/register/check-email'));
  }

  @route('/check-email')
  @GET()
  public checkEmail(req: AppRequest, res: Response): void {
    if (!req.session?.emailSentTo) {
      res.redirect('/register');
      return;
    }
    res.render('register/check-email', { address: req.session.emailSentTo, outbox: req.session.outbox });
  }

  private validate(answers: Record<string, string>, password: string, confirmation: string): FieldError[] {
    const errors: FieldError[] = [];

    for (const [name, label] of [
      ['first-name', 'first name'],
      ['last-name', 'last name'],
    ]) {
      if (!answers[name]) {
        errors.push({ name, text: `Enter your ${label}` });
      } else if (answers[name].length > NAME_MAX_LENGTH) {
        errors.push({ name, text: `Your ${label} must be ${NAME_MAX_LENGTH} characters or fewer` });
      }
    }
    if (!answers.email) {
      errors.push({ name: 'email', text: 'Enter your email address' });
    } else if (!looksLikeAnEmailAddress(answers.email)) {
      errors.push({ name: 'email', text: 'Enter an email address in the correct format, like name@example.com' });
    }
    if (!answers.organisation) {
      errors.push({ name: 'organisation', text: 'Enter your organisation or team' });
    }
    if (!ROLES.some(role => role.value === answers.role)) {
      errors.push({ name: 'role', text: 'Select whether you are registering as a consumer or a producer' });
    }

    const passwordError = validatePassword(password, confirmation);
    if (passwordError) {
      errors.push({ name: passwordError.includes('match') ? 'password-confirm' : 'password', text: passwordError });
    }

    return errors;
  }

  private formData(answers: Record<string, string>, errors: FieldError[]): Record<string, unknown> {
    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      roles: ROLES,
    };
  }
}
