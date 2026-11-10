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
import { FieldError, SummaryRow, toAnswerList, toAnswerText } from '../services/answers';

const logger = Logger.getLogger('production-credentials');

/** What a production request expects to send, in calls per day. */
const CALL_VOLUMES = [
  { value: 'low', text: 'Low', hint: { text: 'Under 1,000 calls per day' } },
  { value: 'medium', text: 'Medium', hint: { text: '1,000 to 100,000 calls per day' } },
  { value: 'high', text: 'High', hint: { text: 'Over 100,000 calls per day' } },
];

/** "Organisation", which helps the Data Access Team triage a request. */
const ORGANISATION_TYPES = [
  { value: 'hmcts', text: 'HMCTS' },
  { value: 'moj', text: 'Ministry of Justice' },
  { value: 'other-government', text: 'Other government department/public body' },
  { value: 'external', text: 'Other external organisation' },
];

/**
 * "Who will have access to, or receive, the data?". Any number of options can be chosen. Choosing
 * only the first means nobody else receives the data, so nothing needs explaining; choosing any
 * other option, with or without the first, asks for an explanation.
 */
const OWN_TEAM_ONLY = 'own-team';
const DATA_RECIPIENTS = [
  { value: OWN_TEAM_ONLY, text: 'Me/my immediate team only' },
  { value: 'other-hmcts', text: 'Other HMCTS teams' },
  { value: 'wider-moj', text: 'Wider MOJ' },
  { value: 'other-government', text: 'Another government department/public body' },
  { value: 'supplier', text: 'Supplier/contract/delivery partner' },
  { value: 'external', text: 'Other external organisation' },
  { value: 'public', text: 'The data will be published or used in a public-facing service' },
];

/** "Will you combine or link the API data with other data?". Yes or Unsure asks what it is combined with. */
const DATA_COMBINED = [
  { value: 'no', text: 'No' },
  { value: 'yes', text: 'Yes' },
  { value: 'unsure', text: 'Unsure' },
];

/** The two questions about the data being requested and what comes out of using it. */
export const DATA_ANSWER_MAX_LENGTH = 2000;

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
      // Inviting a retry would send them round a loop that cannot end.
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
      'organisation-type': text('organisation-type'),
      organisation: text('organisation'),
      'go-live-day': text('go-live-day'),
      'go-live-month': text('go-live-month'),
      'go-live-year': text('go-live-year'),
      'call-volume': text('call-volume'),
      'data-request': text('data-request'),
      'data-recipients': toAnswerList(body['data-recipients']),
      'data-recipients-explanation': text('data-recipients-explanation'),
      'data-combined': text('data-combined'),
      'data-combined-description': text('data-combined-description'),
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
    if (!ORGANISATION_TYPES.some(type => type.value === text('organisation-type'))) {
      errors.push({ name: 'organisation-type', text: 'Select your organisation' });
    }
    if (!text('organisation')) {
      errors.push({
        name: 'organisation',
        text: 'Enter your team name (and organisation if external to HMCTS)',
      });
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
        text: 'Explain why you need access and how you will use the data',
      });
    } else if (text('data-request').length > DATA_ANSWER_MAX_LENGTH) {
      errors.push({
        name: 'data-request',
        text: `Your description must be ${DATA_ANSWER_MAX_LENGTH} characters or fewer`,
      });
    }
    errors.push(...this.validateRecipients(answers), ...this.validateCombined(answers));
    return errors;
  }

  private validateRecipients(answers: Answers): FieldError[] {
    const chosen = Array.isArray(answers['data-recipients']) ? answers['data-recipients'] : [];
    const explanation =
      typeof answers['data-recipients-explanation'] === 'string' ? answers['data-recipients-explanation'] : '';

    if (!chosen.length || !chosen.every(value => DATA_RECIPIENTS.some(option => option.value === value))) {
      return [{ name: 'data-recipients', text: 'Select who will have access to, or receive, the data' }];
    }
    const others = chosen.filter(value => value !== OWN_TEAM_ONLY);
    if (others.length && !explanation) {
      return [{ name: 'data-recipients-explanation', text: 'Briefly explain who will receive the data and why' }];
    }
    if (explanation.length > DATA_ANSWER_MAX_LENGTH) {
      return [
        {
          name: 'data-recipients-explanation',
          text: `Your explanation must be ${DATA_ANSWER_MAX_LENGTH} characters or fewer`,
        },
      ];
    }
    return [];
  }

  private validateCombined(answers: Answers): FieldError[] {
    const chosen = typeof answers['data-combined'] === 'string' ? answers['data-combined'] : '';
    const description =
      typeof answers['data-combined-description'] === 'string' ? answers['data-combined-description'] : '';

    if (!DATA_COMBINED.some(option => option.value === chosen)) {
      return [{ name: 'data-combined', text: 'Select whether you will combine or link the API data with other data' }];
    }
    if (chosen !== 'no' && !description) {
      return [
        {
          name: 'data-combined-description',
          text: 'Briefly describe the other data and what the combined data will be used for',
        },
      ];
    }
    if (description.length > DATA_ANSWER_MAX_LENGTH) {
      return [
        {
          name: 'data-combined-description',
          text: `Your description must be ${DATA_ANSWER_MAX_LENGTH} characters or fewer`,
        },
      ];
    }
    return [];
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

  /** The applications that already have a request, by client id. */
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
      { key: 'Organisation', value: label(ORGANISATION_TYPES, answers['organisation-type']) },
      { key: 'Team name (and organisation if external to HMCTS?)', value: String(answers.organisation ?? '') },
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
      {
        key: 'Who will have access to, or receive, the data?',
        value: (Array.isArray(answers['data-recipients']) ? answers['data-recipients'] : [])
          .map(value => label(DATA_RECIPIENTS, value))
          .join(', '),
      },
      ...(answers['data-recipients-explanation']
        ? [{ key: 'Who will receive the data and why', value: String(answers['data-recipients-explanation']) }]
        : []),
      {
        key: 'Will you combine or link the API data with other data?',
        value: label(DATA_COMBINED, answers['data-combined']),
      },
      ...(answers['data-combined'] !== 'no' && answers['data-combined-description']
        ? [
            {
              key: 'Other data and what the combined data will be used for',
              value: String(answers['data-combined-description']),
            },
          ]
        : []),
    ];
  }

  private toSubmission(answers: Answers): ProductionRequestSubmission {
    const text = (name: string) => (typeof answers[name] === 'string' ? (answers[name] as string) : '');
    const goLive = this.goLiveDate(answers) as Date;

    // The two explanations are left out when empty rather than sent blank, so a request the
    // backend holds carries an answer only where one was asked for.
    return {
      clientId: text('application'),
      organisation: text('organisation'),
      goLiveDate: goLive.toISOString().slice(0, 10),
      callVolume: text('call-volume'),
      dataRequest: text('data-request'),
      organisationType: text('organisation-type'),
      dataRecipients: Array.isArray(answers['data-recipients']) ? answers['data-recipients'] : [],
      dataCombined: text('data-combined'),
      ...(text('data-recipients-explanation')
        ? { dataRecipientsExplanation: text('data-recipients-explanation') }
        : {}),
      ...(text('data-combined-description') ? { dataCombinedDescription: text('data-combined-description') } : {}),
    };
  }

  private storedRows(request: ProductionRequestDetail): SummaryRow[] {
    const label = (options: { value: string; text: string }[], value: string) =>
      options.find(option => option.value === value)?.text ?? value;

    // Every triage answer is optional here: requests made before the questions were added
    // carry none of them, and proposedOutputs is the question they carry instead.
    return [
      { key: 'Application', value: request.applicationName },
      ...(request.organisationType
        ? [{ key: 'Organisation', value: label(ORGANISATION_TYPES, request.organisationType) }]
        : []),
      { key: 'Team name (and organisation if external to HMCTS?)', value: request.organisation },
      { key: 'Go-live date', value: this.formatDate(request.goLiveDate) },
      { key: 'Expected call volume', value: label(CALL_VOLUMES, request.callVolume) },
      { key: 'Data request', value: request.dataRequest },
      ...(request.dataRecipients?.length
        ? [
            {
              key: 'Who will have access to, or receive, the data?',
              value: request.dataRecipients.map(value => label(DATA_RECIPIENTS, value)).join(', '),
            },
          ]
        : []),
      ...(request.dataRecipientsExplanation
        ? [{ key: 'Who will receive the data and why', value: request.dataRecipientsExplanation }]
        : []),
      ...(request.dataCombined
        ? [
            {
              key: 'Will you combine or link the API data with other data?',
              value: label(DATA_COMBINED, request.dataCombined),
            },
          ]
        : []),
      ...(request.dataCombinedDescription
        ? [
            {
              key: 'Other data and what the combined data will be used for',
              value: request.dataCombinedDescription,
            },
          ]
        : []),
      ...(request.proposedOutputs ? [{ key: 'Proposed outputs', value: request.proposedOutputs }] : []),
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
    const withoutARequest = owned.filter(application => !alreadyRequested.has(application.clientId));

    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      applicationItems: withoutARequest.map(application => ({
        value: application.id,
        text: application.name,
        hint: {
          text: `${application.apis.length} ${application.apis.length === 1 ? 'API' : 'APIs'}`,
        },
      })),
      callVolumes: CALL_VOLUMES,
      organisationTypeItems: ORGANISATION_TYPES.map(type => ({
        ...type,
        checked: type.value === answers['organisation-type'],
      })),
      dataRecipientItems: DATA_RECIPIENTS.map(option => ({
        ...option,
        checked: Array.isArray(answers['data-recipients']) && answers['data-recipients'].includes(option.value),
        attributes: option.value === OWN_TEAM_ONLY ? { 'data-explanation-not-needed': 'true' } : undefined,
      })),
      dataCombinedItems: DATA_COMBINED.map(option => ({
        ...option,
        checked: option.value === answers['data-combined'],
      })),
      dataAnswerMaxLength: DATA_ANSWER_MAX_LENGTH,
    };
  }
}
