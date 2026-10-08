import { GET, POST, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn, takeNotice } from '../modules/session';
import { CatalogueApi, getCatalogueApis } from '../services/ApiCatalogue';
import {
  APPLICATION_NAME_MAX_LENGTH,
  Application,
  ApplicationDraft,
  ENVIRONMENTS,
  SELF_SERVICE_ENVIRONMENT,
  createApplication,
  deleteApplication,
  environmentName,
  getApplication,
  listApplications,
  regenerateSecret,
  setApis,
  validateApis,
  validateDetails,
} from '../services/Applications';
import { credentialsAreSimulated, maskSecret } from '../services/Credentials';
import { SignedInUser } from '../services/SignIn';
import { FieldError, toAnswerList, toAnswerText } from '../services/answers';

/**
 * Manage applications: create one, choose its APIs, see and rotate its credentials, and
 * delete it.
 *
 * The create journey holds its answers in the session between pages, rather than posting
 * them on as hidden fields like the request forms do: it is four pages with "change"
 * links back into the middle, and the session is in Redis, so it survives a refresh and
 * any replica can serve the next page.
 *
 * A client secret is shown exactly once — on the page that follows creating or
 * regenerating it — and never stored, matching how Entra ID treats secrets.
 */
@route('/account/applications')
export default class ApplicationsController {
  @GET()
  public async list(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const applications = await listApplications(this.owner(req));
    res.render('applications/index', {
      notice: takeNotice(req),
      groups: ENVIRONMENTS.map(environment => ({
        name: environment.text,
        applications: applications.filter(application => application.environment === environment.value),
      })).filter(group => group.applications.length),
      count: applications.length,
    });
  }

  // ------------------------------------------------------------- create an application
  // Registered before /:id, so "new" is never taken for an application id.

  @route('/new')
  @GET()
  public intro(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    // Starting again from the beginning starts with nothing filled in.
    delete req.session.applicationDraft;
    res.render('applications/new/index');
  }

  @route('/new/details')
  @GET()
  public details(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.render('applications/new/details', this.detailsData(req.session.applicationDraft ?? {}, []));
  }

  @route('/new/details')
  @POST()
  public async saveDetails(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const draft: ApplicationDraft = {
      ...req.session.applicationDraft,
      environment: SELF_SERVICE_ENVIRONMENT,
      name: toAnswerText(body, 'name'),
      description: toAnswerText(body, 'description'),
    };
    const errors = await validateDetails(this.owner(req), draft);

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
    res.render('applications/new/apis', await this.apisData(req.session.applicationDraft.apis ?? [], []));
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

    const catalogue = await getCatalogueApis();
    const selected = this.selectedApis(req);
    const errors = validateApis(selected, catalogue);

    if (errors.length) {
      res.status(400).render('applications/new/apis', await this.apisData(selected, errors, catalogue));
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

    // Validated again: the name may have been taken in another tab since, and the
    // catalogue may have changed underneath the APIs chosen.
    const errors = draft
      ? [...(await validateDetails(this.owner(req), draft)), ...validateApis(draft.apis ?? [], catalogue)]
      : [];

    if (!draft?.name || errors.length) {
      res.redirect(draft?.name ? '/account/applications/new/details' : '/account/applications');
      return;
    }

    const { application, clientSecret } = await createApplication(
      this.owner(req),
      draft as Required<ApplicationDraft>,
      catalogue
    );

    // Cleared before the page renders, so going back and resubmitting cannot create the
    // application a second time.
    delete req.session.applicationDraft;
    req.session.save(() =>
      res.render('applications/new/confirmation', {
        application,
        clientSecret,
        simulated: credentialsAreSimulated,
      })
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
      environment: environmentName(application.environment),
      maskedSecret: maskSecret(application.secretHint),
      notice: takeNotice(req),
      simulated: credentialsAreSimulated,
    });
  }

  @route('/:id/apis')
  @GET()
  public async editApis(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    res.render('applications/apis', {
      application,
      ...(await this.apisData(
        application.apis.map(api => api.apiName),
        []
      )),
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
    const selected = this.selectedApis(req);
    const errors = validateApis(selected, catalogue);

    if (errors.length) {
      res
        .status(400)
        .render('applications/apis', { application, ...(await this.apisData(selected, errors, catalogue)) });
      return;
    }

    const changes = await setApis(this.owner(req), application.id, selected, catalogue);
    const added = changes?.added.length ?? 0;
    const removed = changes?.removed.length ?? 0;

    req.session.notice = {
      success: true,
      title: 'Success',
      text:
        added || removed
          ? `APIs updated: ${added} added, ${removed} removed. Each API added has its own new subscription key.`
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

    res.render('applications/api', { application, subscription, simulated: credentialsAreSimulated });
  }

  @route('/:id/client-secret')
  @GET()
  public async confirmRegenerate(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }
    res.render('applications/client-secret', { application, maskedSecret: maskSecret(application.secretHint) });
  }

  @route('/:id/client-secret')
  @POST()
  public async regenerate(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    const application = await this.find(req, res, next);
    if (!application) {
      return;
    }

    const clientSecret = await regenerateSecret(this.owner(req), application.id);
    res.render('applications/client-secret-new', {
      application,
      clientSecret,
      simulated: credentialsAreSimulated,
    });
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

    await deleteApplication(this.owner(req), application.id);
    req.session.notice = {
      success: true,
      title: 'Success',
      text: `${application.name} has been deleted. Its client ID, secret and subscription keys no longer work.`,
    };
    req.session.save(() => res.redirect('/account/applications'));
  }

  // ---------------------------------------------------------------------- helpers

  private owner(req: AppRequest): string {
    return (req.session.user as SignedInUser).email;
  }

  /**
   * Looks the application up in the signed-in user's own list. An id that is not one of
   * theirs is "not found" — the same answer as an id that does not exist — so the page
   * gives away nothing about other people's applications.
   */
  private async find(req: AppRequest, res: Response, next: NextFunction): Promise<Application | undefined> {
    if (!requireSignIn(req, res)) {
      return undefined;
    }

    const application = await getApplication(this.owner(req), String(req.params.id));
    if (!application) {
      next();
    }
    return application;
  }

  private selectedApis(req: AppRequest): string[] {
    return toAnswerList((req.body as Record<string, unknown>)?.apis);
  }

  private detailsData(draft: ApplicationDraft, errors: FieldError[]): Record<string, unknown> {
    return {
      draft,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      nameMaxLength: APPLICATION_NAME_MAX_LENGTH,
    };
  }

  private async apisData(
    selected: string[],
    errors: FieldError[],
    apis?: CatalogueApi[]
  ): Promise<Record<string, unknown>> {
    const catalogue = apis ?? (await getCatalogueApis());

    return {
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      catalogueUnavailable: catalogue.length === 0,
      apiItems: catalogue.map(api => ({
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
        { key: 'Description', value: draft.description || 'None', href: '/account/applications/new/details' },
        { key: 'APIs', value: titles.join(', '), href: '/account/applications/new/apis' },
      ],
    };
  }
}
