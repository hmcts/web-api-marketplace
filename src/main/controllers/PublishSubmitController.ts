import { GET, POST, route } from 'awilix-express';
import { Request, Response } from 'express';

import {
  CLASSIFICATIONS,
  PUBLISH_DECLARATIONS,
  PublicationRequestAnswers,
  publicationSummaryRows,
  submitPublicationRequest,
  toPublicationAnswers,
  validatePublication,
} from '../services/PublicationRequest';
import { FieldError } from '../services/answers';

/**
 * "Submit an API for publication": form, check your answers, confirmation.
 *
 * The same shape as the access request journey — answers are posted on as hidden fields
 * rather than held in a session, so the journey survives a refresh and works with
 * JavaScript unavailable. See RequestApiController for the reasoning.
 */
@route('/publish/submit')
export default class PublishSubmitController {
  @GET()
  public get(req: Request, res: Response): void {
    res.render('publish/submit/index', this.formData(toPublicationAnswers({}), []));
  }

  @POST()
  public post(req: Request, res: Response): void {
    const answers = toPublicationAnswers(req.body as Record<string, unknown>);
    const errors = validatePublication(answers);

    if (errors.length) {
      res.status(400).render('publish/submit/index', this.formData(answers, errors));
      return;
    }

    res.render('publish/submit/check-answers', { answers, rows: publicationSummaryRows(answers) });
  }

  @route('/check-answers')
  @GET()
  public checkAnswers(req: Request, res: Response): void {
    // Reached directly, with no answers to check — send the user back to fill the form in.
    res.redirect('/publish/submit');
  }

  @route('/check-answers')
  @POST()
  public async submit(req: Request, res: Response): Promise<void> {
    const answers = toPublicationAnswers(req.body as Record<string, unknown>);
    const errors = validatePublication(answers);

    // The hidden fields came from a page we rendered, so a failure here means they were
    // tampered with. Back to the form rather than on to a confirmation.
    if (errors.length) {
      res.status(400).render('publish/submit/index', this.formData(answers, errors));
      return;
    }

    res.render('publish/submit/confirmation', { reference: await submitPublicationRequest(answers) });
  }

  @route('/confirmation')
  @GET()
  public confirmation(req: Request, res: Response): void {
    res.redirect('/publish/submit');
  }

  private formData(answers: PublicationRequestAnswers, errors: FieldError[]): Record<string, unknown> {
    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
      classifications: CLASSIFICATIONS,
      declarations: PUBLISH_DECLARATIONS,
    };
  }
}
