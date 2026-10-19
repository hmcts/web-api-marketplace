import { GET, POST, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireSignIn } from '../modules/session';
import { Application, listApplications, ownerOf } from '../services/Applications';
import { addLocalRequest, getLocalRequest, statusText } from '../services/LocalRequests';
import { sendEmail } from '../services/Notify';
import { SignedInUser } from '../services/SignIn';
import { FieldError, SummaryRow, toAnswerText } from '../services/answers';

const logger = Logger.getLogger('production-credentials');

/** What a production request expects to send, in calls per day. */
const CALL_VOLUMES = [
  { value: 'low', text: 'Low', hint: { text: 'Under 1,000 calls per day' } },
  { value: 'medium', text: 'Medium', hint: { text: '1,000 to 100,000 calls per day' } },
  { value: 'high', text: 'High', hint: { text: 'Over 100,000 calls per day' } },
];

/** The two questions about the data being requested and what comes out of using it. */
export const DATA_ANSWER_MAX_LENGTH = 1000;

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
    const applications = await this.applications(user);
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
      rows: this.summaryRows(draft, await this.applications(user)),
    });
  }

  @route('/check-answers')
  @POST()
  public async submit(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const applications = await this.applications(user);
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
          `Dear ${user.name},`,
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
      'data-request': text('data-request'),
      'proposed-outputs': text('proposed-outputs'),
    };
  }

  private validate(answers: Answers, applications: Application[]): FieldError[] {
    const errors: FieldError[] = [];
    const text = (name: string) => (typeof answers[name] === 'string' ? (answers[name] as string) : '');

    if (!applications.some(application => application.id === text('application'))) {
      errors.push({ name: 'application', text: 'Select the application you need production credentials for' });
    }
    if (!text('organisation')) {
      errors.push({ name: 'organisation', text: 'Enter your organisation or team name' });
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
    if (!text('data-request')) {
      errors.push({
        name: 'data-request',
        text: 'Describe the data request, how you plan to use it and why you need it',
      });
    } else if (text('data-request').length > DATA_ANSWER_MAX_LENGTH) {
      errors.push({
        name: 'data-request',
        text: `Your description must be ${DATA_ANSWER_MAX_LENGTH} characters or fewer`,
      });
    }
    if (!text('proposed-outputs')) {
      errors.push({ name: 'proposed-outputs', text: 'Describe the proposed outputs from this data use' });
    } else if (text('proposed-outputs').length > DATA_ANSWER_MAX_LENGTH) {
      errors.push({
        name: 'proposed-outputs',
        text: `Your description must be ${DATA_ANSWER_MAX_LENGTH} characters or fewer`,
      });
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

  private async applications(user: SignedInUser): Promise<Application[]> {
    try {
      return await listApplications(ownerOf(user));
    } catch (error) {
      logger.error(`Could not list the applications for the form: ${(error as Error).message}`);
      return [];
    }
  }

  private summaryRows(answers: Answers, applications: Application[]): SummaryRow[] {
    const application = applications.find(candidate => candidate.id === answers.application);
    const goLive = this.goLiveDate(answers);
    const label = (options: { value: string; text: string }[], value: Answers[string] | undefined) =>
      options.find(option => option.value === value)?.text ?? (typeof value === 'string' ? value : '');

    return [
      {
        key: 'Application',
        value: application?.name ?? '',
      },
      { key: 'APIs', value: application?.apis.map(api => api.apiTitle).join(', ') || 'None' },
      { key: 'Organisation or team name', value: String(answers.organisation ?? '') },
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
      { key: 'Data request', value: String(answers['data-request'] ?? '') },
      { key: 'Proposed outputs', value: String(answers['proposed-outputs'] ?? '') },
    ];
  }

  private async formData(
    user: SignedInUser,
    answers: Answers,
    errors: FieldError[],
    applications?: Application[]
  ): Promise<Record<string, unknown>> {
    const owned = applications ?? (await this.applications(user));

    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      applicationItems: owned.map(application => ({
        value: application.id,
        text: application.name,
        hint: {
          text: `${application.apis.length} ${application.apis.length === 1 ? 'API' : 'APIs'}`,
        },
      })),
      callVolumes: CALL_VOLUMES,
      dataAnswerMaxLength: DATA_ANSWER_MAX_LENGTH,
    };
  }
}
