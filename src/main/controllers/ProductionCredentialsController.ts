import { GET, POST, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireSignIn } from '../modules/session';
import { CALL_VOLUMES } from '../services/AccessRequest';
import { Application, environmentName, listApplications } from '../services/Applications';
import { addLocalRequest, getLocalRequest, statusText } from '../services/LocalRequests';
import { sendEmail } from '../services/Notify';
import { SignedInUser } from '../services/SignIn';
import { FieldError, SummaryRow, looksLikeAnEmailAddress, toAnswerList, toAnswerText } from '../services/answers';

const logger = Logger.getLogger('production-credentials');

export const USE_CASE_MAX_LENGTH = 1000;

const YES_NO = [
  { value: 'yes', text: 'Yes' },
  { value: 'no', text: 'No' },
];

const DSA_OPTIONS = [
  { value: 'in-place', text: 'Yes, it is in place' },
  { value: 'in-progress', text: 'It is being arranged' },
  { value: 'not-needed', text: 'Not needed', hint: { text: 'None of the APIs return personal data' } },
];

const DECLARATION = {
  value: 'confirmed',
  text: 'I confirm the application has been tested against the sandbox, and will be used only as described here and in line with the guidelines for using HMCTS APIs',
};

type Answers = Record<string, string | string[]>;

/**
 * "Request production credentials": the form, check your answers, a confirmation, and a
 * page to follow the request afterwards.
 *
 * Production credentials are not issued from here. The request is reviewed and the
 * client ID, secret, subscription keys and publisher IDs are created by hand — the offline
 * process agreed for production — so the outcome is a reference and a status, not
 * credentials.
 */
@route('/account/production-credentials')
export default class ProductionCredentialsController {
  @GET()
  public async form(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const preselected = typeof req.query.application === 'string' ? req.query.application : undefined;
    const answers: Answers = {
      organisation: user.orgName,
      'security-contact': user.email,
      ...req.session.productionDraft,
      ...(preselected ? { application: preselected } : {}),
    };

    res.render('production-credentials/form', await this.formData(user, answers, []));
  }

  @POST()
  public async save(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const applications = await listApplications(user.email);
    const answers = this.toAnswers(req.body as Record<string, unknown>);
    const errors = this.validate(answers, applications);

    if (errors.length) {
      res.status(400).render('production-credentials/form', await this.formData(user, answers, errors, applications));
      return;
    }

    req.session.productionDraft = answers;
    req.session.save(() => res.redirect('/account/production-credentials/check-answers'));
  }

  @route('/check-answers')
  @GET()
  public async checkAnswers(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const draft = req.session.productionDraft;
    if (!draft) {
      res.redirect('/account/production-credentials');
      return;
    }

    const user = req.session.user as SignedInUser;
    res.render('production-credentials/check-answers', {
      rows: this.summaryRows(draft, await listApplications(user.email)),
    });
  }

  @route('/check-answers')
  @POST()
  public async submit(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const applications = await listApplications(user.email);
    const draft = req.session.productionDraft;

    // Checked again: the application chosen may have been deleted since in another tab.
    if (!draft || this.validate(draft, applications).length) {
      res.redirect('/account/production-credentials');
      return;
    }

    const rows = this.summaryRows(draft, applications);

    try {
      const request = await addLocalRequest(user.email, 'PRODUCTION', rows);

      sendEmail({
        template: 'production-request-received',
        to: user.email,
        subject: `We have received your production credentials request ${request.reference}`,
        paragraphs: [
          `Dear ${user.firstName},`,
          `We have received your request for production credentials. Your reference is ${request.reference}.`,
          'The marketplace team will review it and email you with the outcome, or to ask for more information.',
        ],
        link: { text: 'View your request', href: `/account/production-credentials/${request.reference}` },
      });

      delete req.session.productionDraft;
      req.session.save(() => res.render('production-credentials/confirmation', { reference: request.reference }));
    } catch (error) {
      logger.error(`Production credentials request could not be stored: ${(error as Error).message}`);
      res.status(502).render('production-credentials/check-answers', {
        rows,
        error: 'Your request could not be submitted. Try again in a few minutes.',
      });
    }
  }

  @route('/:reference')
  @GET()
  public async view(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const request = await getLocalRequest(user.email, String(req.params.reference));

    // Another user's reference is "not found", the same as one that does not exist.
    if (request?.type !== 'PRODUCTION') {
      next();
      return;
    }

    res.render('production-credentials/view', { request, status: statusText(request.status) });
  }

  private toAnswers(body: Record<string, unknown>): Answers {
    const text = (name: string) => toAnswerText(body, name);
    return {
      application: text('application'),
      organisation: text('organisation'),
      'go-live-day': text('go-live-day'),
      'go-live-month': text('go-live-month'),
      'go-live-year': text('go-live-year'),
      'call-volume': text('call-volume'),
      dpia: text('dpia'),
      dsa: text('dsa'),
      'security-contact': text('security-contact'),
      'use-case': text('use-case'),
      declaration: toAnswerList(body.declaration),
    };
  }

  private validate(answers: Answers, applications: Application[]): FieldError[] {
    const errors: FieldError[] = [];
    const text = (name: string) => (typeof answers[name] === 'string' ? (answers[name] as string) : '');

    if (!applications.some(application => application.id === text('application'))) {
      errors.push({ name: 'application', text: 'Select the application you need production credentials for' });
    }
    if (!text('organisation')) {
      errors.push({ name: 'organisation', text: 'Enter the legal name of your organisation' });
    }
    const goLive = this.goLiveDate(answers);
    if (!goLive) {
      errors.push({ name: 'go-live-day', text: 'Enter a real go-live date, for example 27 3 2027' });
    } else if (goLive.getTime() <= Date.now()) {
      errors.push({ name: 'go-live-day', text: 'The go-live date must be in the future' });
    }
    if (!CALL_VOLUMES.some(volume => volume.value === text('call-volume'))) {
      errors.push({ name: 'call-volume', text: 'Select the expected call volume' });
    }
    if (!YES_NO.some(option => option.value === text('dpia'))) {
      errors.push({ name: 'dpia', text: 'Select whether you have completed a Data Protection Impact Assessment' });
    }
    if (!DSA_OPTIONS.some(option => option.value === text('dsa'))) {
      errors.push({ name: 'dsa', text: 'Select whether a Data Sharing Agreement is in place' });
    }
    if (!looksLikeAnEmailAddress(text('security-contact'))) {
      errors.push({
        name: 'security-contact',
        text: 'Enter a security contact email address, like security@example.com',
      });
    }
    if (!text('use-case')) {
      errors.push({ name: 'use-case', text: 'Describe how your application will use the APIs in production' });
    } else if (text('use-case').length > USE_CASE_MAX_LENGTH) {
      errors.push({ name: 'use-case', text: `Your description must be ${USE_CASE_MAX_LENGTH} characters or fewer` });
    }
    if (!toAnswerList(answers.declaration).includes(DECLARATION.value)) {
      errors.push({ name: 'declaration', text: 'You must confirm the declaration' });
    }

    return errors;
  }

  private goLiveDate(answers: Answers): Date | undefined {
    const [day, month, year] = ['go-live-day', 'go-live-month', 'go-live-year'].map(name => Number(answers[name]));
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || year < 1000) {
      return undefined;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    // Rejects 31 February and the like, which Date would otherwise roll into March.
    return date.getUTCDate() === day && date.getUTCMonth() === month - 1 ? date : undefined;
  }

  private summaryRows(answers: Answers, applications: Application[]): SummaryRow[] {
    const application = applications.find(candidate => candidate.id === answers.application);
    const goLive = this.goLiveDate(answers);
    const label = (options: { value: string; text: string }[], value: Answers[string] | undefined) =>
      options.find(option => option.value === value)?.text ?? (typeof value === 'string' ? value : '');

    return [
      {
        key: 'Application',
        value: application ? `${application.name} (${environmentName(application.environment)})` : '',
      },
      { key: 'APIs', value: application?.apis.map(api => api.apiTitle).join(', ') || 'None' },
      { key: 'Organisation', value: String(answers.organisation ?? '') },
      {
        key: 'Go-live date',
        value: goLive
          ? new Intl.DateTimeFormat('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(goLive)
          : '',
      },
      { key: 'Expected call volume', value: label(CALL_VOLUMES, answers['call-volume']) },
      { key: 'Data Protection Impact Assessment completed', value: label(YES_NO, answers.dpia) },
      { key: 'Data Sharing Agreement', value: label(DSA_OPTIONS, answers.dsa) },
      { key: 'Security contact', value: String(answers['security-contact'] ?? '') },
      { key: 'How the APIs will be used', value: String(answers['use-case'] ?? '') },
      { key: 'Declaration', value: 'Confirmed' },
    ];
  }

  private async formData(
    user: SignedInUser,
    answers: Answers,
    errors: FieldError[],
    applications?: Application[]
  ): Promise<Record<string, unknown>> {
    const owned = applications ?? (await listApplications(user.email));

    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      applicationItems: owned.map(application => ({
        value: application.id,
        text: application.name,
        hint: {
          text: `${environmentName(application.environment)} – ${application.apis.length} ${application.apis.length === 1 ? 'API' : 'APIs'}`,
        },
      })),
      callVolumes: CALL_VOLUMES,
      yesNo: YES_NO,
      dsaOptions: DSA_OPTIONS,
      declaration: DECLARATION,
      useCaseMaxLength: USE_CASE_MAX_LENGTH,
    };
  }
}
