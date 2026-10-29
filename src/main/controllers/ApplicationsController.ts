import { GET, POST, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireSignIn, takeNotice } from '../modules/session';
import { CatalogueApi, getCatalogueApis, listedApiNames, offeredApis } from '../services/ApiCatalogue';
import { instructionsFor, publisherId } from '../services/ApiInstructions';
import {
  ACCESS_ATTEMPTS,
  ACCESS_RETRY_SECONDS,
  Application,
  ApplicationDraft,
  BackendError,
  Owner,
  createApplication,
  deleteApplication,
  getApplication,
  grantAccess,
  limitReached,
  listApplications,
  maskSecret,
  ownerOf,
  setApis,
  subscriptionKey,
  validateApis,
  validateName,
} from '../services/Applications';
import { SignedInUser } from '../services/SignIn';
import { FieldError, toAnswerList, toAnswerText } from '../services/answers';

const logger = Logger.getLogger('applications');

/** The client secret exists only in the response to creating the application, so it is shown on that page alone. */
@route('/account/applications')
export default class ApplicationsController {
  @GET()
  public async list(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    let applications: Application[];
    try {
      applications = await listApplications(this.owner(req));
    } catch (error) {
      this.backendFailed(req, res, error);
      return;
    }
    res.render('applications/index', {
      notice: takeNotice(req),
      applications,
      atLimit: limitReached(applications.length),
    });
  }

  // Registered before /:id, so "new" is never taken for a client ID.

  @route('/new')
  @GET()
  public async intro(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res) || (await this.refusedAtLimit(req, res))) {
      return;
    }
    delete req.session.applicationDraft;
    res.render('applications/new/index');
  }

  @route('/new/details')
  @GET()
  public async details(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res) || (await this.refusedAtLimit(req, res))) {
      return;
    }
    res.render('applications/new/details', this.detailsData(req.session.applicationDraft ?? {}, []));
  }

  @route('/new/details')
  @POST()
  public saveDetails(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }

    const draft: ApplicationDraft = {
      ...req.session.applicationDraft,
      name: toAnswerText((req.body ?? {}) as Record<string, unknown>, 'name'),
    };
    const errors = validateName(draft.name);

    if (errors.length) {
      res.status(400).render('applications/new/details', this.detailsData(draft, errors));
      return;
    }

    req.session.applicationDraft = draft;
    req.session.save(() =>
      res.redirect(draft.apis?.length ? '/account/applications/new/check-answers' : '/account/applications/new/apis')
    );
  }

  @route('/new/apis')
  @GET()
  public async chooseApis(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }
    if (!req.session.applicationDraft?.name) {
      res.redirect('/account/applications/new/details');
      return;
    }
    res.render(
      'applications/new/apis',
      this.apisData(req.session.applicationDraft.apis ?? [], [], await this.offered())
    );
  }

  @route('/new/apis')
  @POST()
  public async saveApis(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }
    if (!req.session.applicationDraft?.name) {
      res.redirect('/account/applications/new/details');
      return;
    }

    const offered = await this.offered();
    const selected = this.selectedApis(req);
    const errors = validateApis(selected, offered);

    if (errors.length) {
      res.status(400).render('applications/new/apis', this.apisData(selected, errors, offered));
      return;
    }

    req.session.applicationDraft.apis = selected;
    req.session.save(() => res.redirect('/account/applications/new/check-answers'));
  }

  @route('/new/check-answers')
  @GET()
  public async checkAnswers(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const draft = req.session.applicationDraft;
    if (!draft?.name) {
      res.redirect('/account/applications/new/details');
      return;
    }
    if (!draft.apis?.length) {
      res.redirect('/account/applications/new/apis');
      return;
    }
    res.render('applications/new/check-answers', await this.checkAnswersData(draft));
  }

  @route('/new/check-answers')
  @POST()
  public async create(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const draft = req.session.applicationDraft;
    const catalogue = await getCatalogueApis();
    const offered = offeredApis(catalogue, listedApiNames());
    const errors = draft ? [...validateName(draft.name), ...validateApis(draft.apis ?? [], offered)] : [];

    if (!draft?.name || errors.length) {
      res.redirect(draft?.name ? '/account/applications/new/details' : '/account/applications');
      return;
    }

    let atLimit;
    try {
      atLimit = limitReached((await listApplications(this.owner(req))).length);
    } catch (error) {
      this.backendFailed(req, res, error);
      return;
    }
    if (atLimit) {
      this.sendBackAtLimit(req, res, atLimit);
      return;
    }

    let created;
    try {
      created = await createApplication(this.owner(req), draft as Required<ApplicationDraft>, catalogue);
    } catch (error) {
      if (error instanceof BackendError && (error.status === 400 || error.status === 409)) {
        const message = error.status === 409 ? `You already have an application called ${draft.name}` : error.message;
        res.status(400).render('applications/new/details', this.detailsData(draft, [{ name: 'name', text: message }]));
        return;
      }
      this.backendFailed(req, res, error);
      return;
    }

    delete req.session.applicationDraft;
    const scopedTo = await publisherId();
    req.session.save(() =>
      res.render('applications/new/confirmation', { ...created, ...this.accessData(), publisherId: scopedTo })
    );
  }

  // --------------------------------------------------------------- one application

  @route('/:id')
  @GET()
  public async detail(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    res.render('applications/detail', {
      application,
      maskedSecret: maskSecret(application.secretHint),
      notice: takeNotice(req),
      ...this.accessData(),
      ...(await instructionsFor(application)),
    });
  }

  @route('/:id/access')
  @POST()
  public async access(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    let result;
    try {
      result = await grantAccess(this.owner(req), application);
    } catch (error) {
      if (req.accepts(['html', 'json']) === 'json') {
        logger.error(`Could not grant access to ${application.clientId}: ${(error as Error).message}`);
        res.status(502).json({ state: 'failed', message: 'The service could not be reached. Try again later.' });
        return;
      }
      this.backendFailed(req, res, error);
      return;
    }

    if (req.accepts(['html', 'json']) === 'json') {
      res.json(result);
      return;
    }
    req.session.notice = {
      success: result.state === 'granted',
      title: result.state === 'granted' ? 'Success' : 'Important',
      text:
        result.state === 'granted'
          ? `${application.name} can now call the APIs it is subscribed to.`
          : result.state === 'pending'
            ? 'Access is still being set up. Try again in a minute.'
            : `Access could not be set up: ${result.message}`,
    };
    req.session.save(() => res.redirect(`/account/applications/${application.id}`));
  }

  @route('/:id/apis')
  @GET()
  public async editApis(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    const current = application.apis.map(api => api.apiName);
    res.render('applications/apis', {
      application,
      ...this.apisData(current, [], await this.offered(current)),
    });
  }

  @route('/:id/apis')
  @POST()
  public async saveEditedApis(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    const catalogue = await getCatalogueApis();
    const offered = offeredApis(
      catalogue,
      listedApiNames(),
      application.apis.map(api => api.apiName)
    );
    const selected = this.selectedApis(req);
    const errors = validateApis(selected, offered);

    if (errors.length) {
      res.status(400).render('applications/apis', { application, ...this.apisData(selected, errors, offered) });
      return;
    }

    const changes = await setApis(this.owner(req), application, selected, catalogue);
    const { added, removed, failed } = changes;

    req.session.notice = failed.length
      ? {
          success: false,
          title: 'Important',
          text: `Some APIs could not be changed: ${failed.join(', ')}. Try again in a few minutes.`,
        }
      : {
          success: true,
          title: 'Success',
          text:
            added.length || removed.length
              ? `APIs updated: ${added.length} added, ${removed.length} removed. Each API added has its own new subscription key.`
              : 'No changes were made to the APIs.',
        };
    req.session.save(() => res.redirect(`/account/applications/${application.id}`));
  }

  @route('/:id/apis/:api')
  @GET()
  public async api(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    const subscription = application.apis.find(api => api.apiName === req.params.api);
    if (!subscription) {
      next();
      return;
    }

    let key: string | undefined;
    try {
      key = await subscriptionKey(this.owner(req), subscription);
    } catch (error) {
      logger.error(`Could not read the key for ${subscription.subscriptionName}: ${(error as Error).message}`);
    }
    res.render('applications/api', { application, subscription, subscriptionKey: key });
  }

  @route('/:id/delete')
  @GET()
  public async confirmDelete(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }
    res.render('applications/delete', { application });
  }

  @route('/:id/delete')
  @POST()
  public async remove(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    if (toAnswerText(req.body as Record<string, unknown>, 'confirm') !== 'yes') {
      res.redirect(`/account/applications/${application.id}`);
      return;
    }

    try {
      await deleteApplication(this.owner(req), application);
    } catch (error) {
      this.backendFailed(req, res, error);
      return;
    }
    req.session.notice = {
      success: true,
      title: 'Success',
      text: `${application.name} has been deleted. Its client ID, secret and subscription keys no longer work.`,
    };
    req.session.save(() => res.redirect('/account/applications'));
  }

  // ---------------------------------------------------------------------- helpers

  private owner(req: AppRequest): Owner {
    return ownerOf(req.session.user as SignedInUser);
  }

  private async find(req: AppRequest, res: Response, next: NextFunction): Promise<Application | undefined> {
    if (!requireSignIn(req, res)) {
      return undefined;
    }

    try {
      const application = await getApplication(this.owner(req), String(req.params.id));
      if (!application) {
        next();
      }
      return application;
    } catch (error) {
      this.backendFailed(req, res, error);
      return undefined;
    }
  }

  private async refusedAtLimit(req: AppRequest, res: Response): Promise<boolean> {
    let atLimit;
    try {
      atLimit = limitReached((await listApplications(this.owner(req))).length);
    } catch (error) {
      logger.warn(`Could not count the user's applications: ${(error as Error).message}`);
      return false;
    }
    if (atLimit) {
      this.sendBackAtLimit(req, res, atLimit);
    }
    return Boolean(atLimit);
  }

  private sendBackAtLimit(req: AppRequest, res: Response, text: string): void {
    req.session.notice = { success: false, title: 'Important', text };
    req.session.save(() => res.redirect('/account/applications'));
  }

  private backendFailed(req: AppRequest, res: Response, error: unknown): void {
    if (error instanceof BackendError && error.signInAgain) {
      req.session.destroy(() => res.redirect('/sign-in'));
      return;
    }
    logger.error(`Applications backend call failed: ${(error as Error).message}`);
    res.status(503).render('applications/unavailable');
  }

  private accessData(): Record<string, unknown> {
    return { accessAttempts: ACCESS_ATTEMPTS, accessRetrySeconds: ACCESS_RETRY_SECONDS };
  }

  private selectedApis(req: AppRequest): string[] {
    return toAnswerList((req.body as Record<string, unknown>)?.apis);
  }

  private detailsData(draft: ApplicationDraft, errors: FieldError[]): Record<string, unknown> {
    return { draft, errors, errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])) };
  }

  /** The APIs the application pages offer: see offeredApis. */
  private async offered(alreadyChosen: string[] = []): Promise<CatalogueApi[]> {
    return offeredApis(await getCatalogueApis(), listedApiNames(), alreadyChosen);
  }

  private apisData(selected: string[], errors: FieldError[], apis: CatalogueApi[]): Record<string, unknown> {
    return {
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      catalogueUnavailable: apis.length === 0,
      apiItems: apis.map(api => ({
        value: api.name,
        text: api.title,
        hint: api.description ? { text: api.description } : undefined,
        checked: selected.includes(api.name),
      })),
    };
  }

  private async checkAnswersData(draft: ApplicationDraft): Promise<Record<string, unknown>> {
    const catalogue = await getCatalogueApis();
    const titles = (draft.apis ?? []).map(name => catalogue.find(api => api.name === name)?.title ?? name);

    return {
      rows: [
        { key: 'Application name', value: draft.name, href: '/account/applications/new/details' },
        { key: 'APIs', value: titles.join(', '), href: '/account/applications/new/apis' },
      ],
    };
  }
}
