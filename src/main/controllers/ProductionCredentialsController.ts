import { GET, POST, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireSignIn } from '../modules/session';
import { Application, BackendError, listApplications, ownerOf } from '../services/Applications';
import { statusText } from '../services/LocalRequests';
import { sendEmail } from '../services/Notify';
import {
  ProductionRequestDetail,
  ProductionRequestSubmission,
  getProductionRequest,
  listProductionRequests,
  submitProductionRequest,
} from '../services/ProductionRequests';
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
    const requested = await this.alreadyRequested(user);
    const answers = this.toAnswers(req.body as Record<string, unknown>);
    const errors = this.validate(answers, applications, requested);

    if (errors.length) {
      res
        .status(400)
        .render('production-credentials/form', await this.formData(user, answers, errors, applications, requested));
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
    const requested = await this.alreadyRequested(user);
    const draft = req.session.productionDraft;

    // Checked again: the application chosen may have been deleted, or asked for in another tab.
    if (!draft || this.validate(draft, applications, requested).length) {
      res.redirect('/account/production-credentials');
      return;
    }

    const rows = this.summaryRows(draft, applications);

    try {
      const request = await submitProductionRequest(ownerOf(user), this.toSubmission(draft));

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
      // A request made since this one was drafted, in another tab or by a colleague: saying
      // "try again in a few minutes" would send them round a loop that cannot end.
      const duplicate = error instanceof BackendError && error.status === 409;
      res.status(duplicate ? 409 : 502).render('production-credentials/check-answers', {
        rows,
        error: duplicate
          ? (error as BackendError).message
          : 'Your request could not be submitted. Try again in a few minutes.',
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
    const request = await getProductionRequest(ownerOf(user), String(req.params.reference));

    if (!request) {
      next();
      return;
    }

    res.render('production-credentials/view', {
      request,
      status: statusText(request.status),
      rows: this.storedRows(request),
    });
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

  private validate(answers: Answers, applications: Application[], requested: Set<string>): FieldError[] {
    const errors: FieldError[] = [];
    const text = (name: string) => (typeof answers[name] === 'string' ? (answers[name] as string) : '');

    const chosen = applications.find(application => application.id === text('application'));
    if (!chosen) {
      errors.push({ name: 'application', text: 'Select the application you need production credentials for' });
    } else if (requested.has(chosen.clientId)) {
      errors.push({
        name: 'application',
        text: `${chosen.name} already has a production access request`,
      });
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

  /**
   * The applications that already have a request, by client id. One request per application, so
   * these cannot be asked for again - the form leaves them out and validation refuses them.
   */
  private async alreadyRequested(user: SignedInUser): Promise<Set<string>> {
    try {
      const requests = await listProductionRequests(ownerOf(user));
      return new Set(requests.map(request => request.clientId).filter((id): id is string => !!id));
    } catch (error) {
      logger.error(`Could not list the production requests for the form: ${(error as Error).message}`);
      return new Set();
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

  private toSubmission(answers: Answers): ProductionRequestSubmission {
    const text = (name: string) => (typeof answers[name] === 'string' ? (answers[name] as string) : '');
    const goLive = this.goLiveDate(answers) as Date;

    return {
      clientId: text('application'),
      organisation: text('organisation'),
      goLiveDate: goLive.toISOString().slice(0, 10),
      callVolume: text('call-volume'),
      dataRequest: text('data-request'),
      proposedOutputs: text('proposed-outputs'),
    };
  }

  private storedRows(request: ProductionRequestDetail): SummaryRow[] {
    const label = (options: { value: string; text: string }[], value: string) =>
      options.find(option => option.value === value)?.text ?? value;

    return [
      { key: 'Application', value: request.applicationName },
      { key: 'Organisation or team name', value: request.organisation },
      { key: 'Go-live date', value: this.formatDate(request.goLiveDate) },
      { key: 'Expected call volume', value: label(CALL_VOLUMES, request.callVolume) },
      { key: 'Data request', value: request.dataRequest },
      { key: 'Proposed outputs', value: request.proposedOutputs },
    ];
  }

  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);

    if (Number.isNaN(date.getTime())) {
      return isoDate;
    }
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  private async formData(
    user: SignedInUser,
    answers: Answers,
    errors: FieldError[],
    applications?: Application[],
    requested?: Set<string>
  ): Promise<Record<string, unknown>> {
    const owned = applications ?? (await this.applications(user));
    const alreadyRequested = requested ?? (await this.alreadyRequested(user));
    const offered = owned.filter(application => !alreadyRequested.has(application.clientId));

    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      applicationItems: offered.map(application => ({
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
