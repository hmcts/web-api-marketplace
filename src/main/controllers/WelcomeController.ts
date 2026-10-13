import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn, takeReturnTo } from '../modules/session';
import { AccountRole, saveProfile } from '../services/Profiles';
import { SignedInUser } from '../services/SignIn';
import { FieldError, toAnswerList, toAnswerText } from '../services/answers';

const ORGANISATION_MAX_LENGTH = 100;

export const ROLES = [
  { value: 'consumer', text: 'Consumer', hint: { text: 'Find and use existing APIs' } },
  { value: 'producer', text: 'Producer', hint: { text: 'List and manage my APIs' } },
];

/**
 * First sign in: Entra knows the user's name and email address, but not their
 * organisation or whether they consume or publish APIs, so they are asked for here. The
 * user also agrees to the guidelines for using HMCTS APIs before going any further. Shown
 * once — after that, sign in goes straight on.
 */
@route('/account/welcome')
export default class WelcomeController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    const user = req.session.user as SignedInUser;
    res.render('account/welcome', this.formData(user, { organisation: user.orgName, role: user.role ?? '' }, []));
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const answers = { organisation: toAnswerText(body, 'organisation'), role: toAnswerText(body, 'role') };
    const agreed = toAnswerList(body.agree).includes('yes');
    const errors = this.validate(answers, agreed);

    if (errors.length) {
      res.status(400).render('account/welcome', this.formData(user, answers, errors));
      return;
    }

    const role = answers.role as AccountRole;
    await saveProfile(user.oid as string, {
      orgName: answers.organisation,
      role,
      onboardedAt: new Date().toISOString(),
    });
    req.session.user = { ...user, orgName: answers.organisation, role };

    // The welcome interrupted the way somewhere, or the user came straight from sign in
    // with nowhere in mind — in which case their applications are the place to start.
    const next = takeReturnTo(req, '/account/applications');
    req.session.save(() => res.redirect(next === '/account' ? '/account/applications' : next));
  }

  private validate(answers: Record<string, string>, agreed: boolean): FieldError[] {
    const errors: FieldError[] = [];

    if (!answers.organisation) {
      errors.push({ name: 'organisation', text: 'Enter your organisation or team' });
    } else if (answers.organisation.length > ORGANISATION_MAX_LENGTH) {
      errors.push({
        name: 'organisation',
        text: `Your organisation or team must be ${ORGANISATION_MAX_LENGTH} characters or fewer`,
      });
    }
    if (!ROLES.some(role => role.value === answers.role)) {
      errors.push({ name: 'role', text: 'Select whether you are a consumer or a producer' });
    }
    if (!agreed) {
      errors.push({ name: 'agree', text: 'Confirm that you have read and agree to the guidelines' });
    }

    return errors;
  }

  private formData(user: SignedInUser, answers: Record<string, string>, errors: FieldError[]): Record<string, unknown> {
    return {
      profile: user,
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      roles: ROLES,
    };
  }
}
