import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn } from '../modules/session';
import {
  AccessRequestAnswers,
  CALL_VOLUMES,
  DECLARATIONS,
  ENVIRONMENTS,
  FieldError,
  OAUTH_ANSWERS,
  submitAccessRequest,
  summaryRows,
  toAnswers,
  validate,
} from '../services/AccessRequest';
import { CatalogueApi, getCatalogueApis } from '../services/ApiCatalogue';

/**
 * The "Subscribe to an API" journey: form, check your answers, confirmation.
 *
 * The prototype carries answers between the three pages in sessionStorage. There is no
 * session store here, so each page posts the answers on to the next as hidden fields.
 * That keeps the journey working with JavaScript unavailable and leaves no server state
 * to expire, at the cost of the answers travelling with each request.
 */
@route('/subscribe')
export default class SubscribeController {
  @GET()
  public async get(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.render('subscribe/index', await this.formData(toAnswers({}), []));
  }

  @POST()
  public async post(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }
    const apis = await getCatalogueApis();
    const answers = toAnswers(req.body as Record<string, unknown>);
    const errors = validate(
      answers,
      apis.map(api => api.name)
    );

    if (errors.length) {
      res.status(400).render('subscribe/index', await this.formData(answers, errors, apis));
      return;
    }

    res.render('subscribe/check-answers', {
      answers,
      rows: summaryRows(answers, this.titleOf(apis, answers['api-name'])),
    });
  }

  @route('/check-answers')
  @GET()
  public checkAnswers(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    // Reached directly, with no answers to check — send the user back to fill the form in.
    res.redirect('/subscribe');
  }

  @route('/check-answers')
  @POST()
  public async submit(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }
    const apis = await getCatalogueApis();
    const answers = toAnswers(req.body as Record<string, unknown>);
    const errors = validate(
      answers,
      apis.map(api => api.name)
    );

    // The hidden fields came from a page we rendered, so a failure here means they were
    // tampered with or the catalogue changed underneath. Either way, back to the form.
    if (errors.length) {
      res.status(400).render('subscribe/index', await this.formData(answers, errors, apis));
      return;
    }

    const reference = await submitAccessRequest(answers);

    res.render('subscribe/confirmation', { reference });
  }

  @route('/confirmation')
  @GET()
  public confirmation(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.redirect('/subscribe');
  }

  private async formData(
    answers: AccessRequestAnswers,
    errors: FieldError[],
    apis?: CatalogueApi[]
  ): Promise<Record<string, unknown>> {
    const catalogue = apis ?? (await getCatalogueApis());

    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      apiOptions: [{ value: '', text: 'Choose an API' }].concat(
        catalogue.map(api => ({ value: api.name, text: api.title }))
      ),
      environments: ENVIRONMENTS,
      callVolumes: CALL_VOLUMES,
      oauthAnswers: OAUTH_ANSWERS,
      declarations: DECLARATIONS,
    };
  }

  private titleOf(apis: CatalogueApi[], name: string): string {
    return apis.find(api => api.name === name)?.title ?? name;
  }
}
