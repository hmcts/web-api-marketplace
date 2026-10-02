import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn } from '../modules/session';
import { addLocalRequest } from '../services/LocalRequests';
import { SignedInUser } from '../services/SignIn';
import { FieldError, SummaryRow, toAnswerText } from '../services/answers';

export const NEED_MAX_LENGTH = 1000;

const DOMAINS = [
  { value: '', text: 'Choose a domain' },
  { value: 'case-administration', text: 'Case administration' },
  { value: 'hearing-results', text: 'Hearing results' },
  { value: 'scheduling-and-listing', text: 'Scheduling and listing' },
  { value: 'reference-data', text: 'Reference data' },
  { value: 'financial', text: 'Financial' },
  { value: 'not-sure', text: 'Not sure' },
];

const URGENCIES = [
  { value: 'critical', text: 'Critical', hint: { text: 'Blocking a live service' } },
  { value: 'high', text: 'High', hint: { text: 'Needed within 3 months' } },
  { value: 'medium', text: 'Medium', hint: { text: 'Needed within 6 months' } },
  { value: 'low', text: 'Low', hint: { text: 'Future planning' } },
];

type Answers = Record<string, string>;

/**
 * "Request a new API", for data or a capability the catalogue does not have. Migrated
 * from the GitHub Pages site, where it was linked from the catalogue. The requester's
 * name, organisation and email come from the signed-in account rather than being asked
 * for again.
 */
@route('/api-catalogue/request-new-api')
export default class RequestNewApiController {
  @GET()
  public form(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.render('request-new-api/form', this.formData(req.session.newApiDraft as Answers | undefined, []));
  }

  @POST()
  public save(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const answers: Answers = {
      need: toAnswerText(body, 'need'),
      domain: toAnswerText(body, 'domain'),
      urgency: toAnswerText(body, 'urgency'),
      existing: toAnswerText(body, 'existing'),
    };
    const errors = this.validate(answers);

    if (errors.length) {
      res.status(400).render('request-new-api/form', this.formData(answers, errors));
      return;
    }

    req.session.newApiDraft = answers;
    req.session.save(() => res.redirect('/api-catalogue/request-new-api/check-answers'));
  }

  @route('/check-answers')
  @GET()
  public checkAnswers(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }

    const draft = req.session.newApiDraft as Answers | undefined;
    if (!draft) {
      res.redirect('/api-catalogue/request-new-api');
      return;
    }
    res.render('request-new-api/check-answers', { rows: this.summaryRows(draft, req.session.user as SignedInUser) });
  }

  @route('/check-answers')
  @POST()
  public async submit(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const draft = req.session.newApiDraft as Answers | undefined;
    if (!draft || this.validate(draft).length) {
      res.redirect('/api-catalogue/request-new-api');
      return;
    }

    const user = req.session.user as SignedInUser;
    const request = await addLocalRequest(user.email, 'NEW_API', this.summaryRows(draft, user));

    delete req.session.newApiDraft;
    req.session.save(() => res.render('request-new-api/confirmation', { reference: request.reference }));
  }

  private validate(answers: Answers): FieldError[] {
    const errors: FieldError[] = [];

    if (!answers.need) {
      errors.push({ name: 'need', text: 'Describe the data or capability you need' });
    } else if (answers.need.length > NEED_MAX_LENGTH) {
      errors.push({ name: 'need', text: `Your description must be ${NEED_MAX_LENGTH} characters or fewer` });
    }
    if (!DOMAINS.some(domain => domain.value && domain.value === answers.domain)) {
      errors.push({ name: 'domain', text: 'Select the justice domain this relates to' });
    }
    if (!URGENCIES.some(urgency => urgency.value === answers.urgency)) {
      errors.push({ name: 'urgency', text: 'Select how urgent this is' });
    }
    if (answers.existing.length > NEED_MAX_LENGTH) {
      errors.push({ name: 'existing', text: `This must be ${NEED_MAX_LENGTH} characters or fewer` });
    }

    return errors;
  }

  private summaryRows(answers: Answers, user: SignedInUser): SummaryRow[] {
    const label = (options: { value: string; text: string }[], value: string) =>
      options.find(option => option.value === value)?.text ?? value;

    return [
      { key: 'Name', value: `${user.firstName} ${user.lastName}` },
      { key: 'Organisation', value: user.orgName },
      { key: 'Email', value: user.email },
      { key: 'What you need', value: answers.need },
      { key: 'Justice domain', value: label(DOMAINS, answers.domain) },
      { key: 'Urgency', value: label(URGENCIES, answers.urgency) },
      { key: 'Existing system', value: answers.existing || 'Not provided' },
    ];
  }

  private formData(answers: Answers | undefined, errors: FieldError[]): Record<string, unknown> {
    return {
      answers: answers ?? {},
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      domains: DOMAINS,
      urgencies: URGENCIES,
      needMaxLength: NEED_MAX_LENGTH,
    };
  }
}
