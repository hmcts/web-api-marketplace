import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn } from '../modules/session';
import {
  PublicationRequestAnswers,
  Requester,
  publicationSummaryRows,
  submitPublicationRequest,
  toPublicationAnswers,
  validatePublication,
} from '../services/PublicationRequest';
import { SignedInUser } from '../services/SignIn';
import { FieldError } from '../services/answers';

/**
 * "Submit an API for publication": form, check your answers, confirmation.
 *
 * The same shape as the access request journey — answers are posted on as hidden fields
 * rather than held in a session, so the journey survives a refresh and works with
 * JavaScript unavailable. See SubscribeController for the reasoning.
 */
@route('/publish')
export default class PublishController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.render('publish/form', this.formData(toPublicationAnswers({}), []));
  }

  @POST()
  public post(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    const answers = toPublicationAnswers(req.body as Record<string, unknown>);
    const errors = validatePublication(answers);

    if (errors.length) {
      res.status(400).render('publish/form', this.formData(answers, errors));
      return;
    }

    res.render('publish/check-answers', { answers, rows: publicationSummaryRows(answers) });
  }

  @route('/check-answers')
  @GET()
  public checkAnswers(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    // Reached directly, with no answers to check — send the user back to fill the form in.
    res.redirect('/publish');
  }

  @route('/check-answers')
  @POST()
  public async submit(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }
    const answers = toPublicationAnswers(req.body as Record<string, unknown>);
    const errors = validatePublication(answers);

    // The hidden fields came from a page we rendered, so a failure here means they were
    // tampered with. Back to the form rather than on to a confirmation.
    if (errors.length) {
      res.status(400).render('publish/form', this.formData(answers, errors));
      return;
    }

    const result = await submitPublicationRequest(answers, this.requester(req));

    if (!result.ok) {
      // The answers are still on the page, so the user can try again without retyping.
      res.status(502).render('publish/check-answers', {
        answers,
        rows: publicationSummaryRows(answers),
        error: 'Your submission could not be sent. Try again in a few minutes.',
      });
      return;
    }

    res.render('publish/confirmation', { reference: result.reference });
  }

  @route('/confirmation')
  @GET()
  public confirmation(req: AppRequest, res: Response): void {
    if (!requireSignIn(req, res)) {
      return;
    }
    res.redirect('/publish');
  }

  /**
   * Read from the session, never from the body. The check-answers page posts the answers
   * on as hidden fields, so anything taken from the body there could be edited — the
   * requester has to come from the account that is actually signed in.
   */
  private requester(req: AppRequest): Requester {
    const user = req.session.user as SignedInUser;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      orgName: user.orgName,
    };
  }

  private formData(answers: PublicationRequestAnswers, errors: FieldError[]): Record<string, unknown> {
    return {
      answers,
      errors,
      errorFor: Object.fromEntries(errors.map(error => [error.name, error.text])),
    };
  }
}
