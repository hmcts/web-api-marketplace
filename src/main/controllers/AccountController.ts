import { GET, POST, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn } from '../modules/session';
import { RequestSummary, deleteRequest, getRequestsFor, isRequestType } from '../services/Requests';
import { SignedInUser } from '../services/SignIn';

@route('/account')
export default class AccountController {
  @GET()
  public async get(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const result = await getRequestsFor(user.id);
    // Read once and cleared, so the banner appears on the page that follows the delete
    // and not on every visit afterwards.
    const notice = req.session.requestNotice;
    delete req.session.requestNotice;

    res.render('account', {
      ...req.i18n?.getDataByLanguage(req.lng)?.account,
      user,
      myRequests: result.requests.map(request => this.forDisplay(request, req.lng)),
      couldNotLoad: !result.ok,
      deleted: notice === 'deleted',
      deleteFailed: notice === 'deleteFailed',
    });
  }

  /**
   * Deletes one of the signed-in user's requests.
   *
   * POST, so no link and no prefetcher can delete a request by being followed, and a
   * redirect afterwards so refreshing the confirmation does not try to delete it again.
   *
   * Which request is named by the reference in the body, but whose it is comes from the
   * session: the backend is told the signed-in user id, never one posted with the form.
   */
  @route('/delete-request')
  @POST()
  public async remove(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reference = String(body.reference ?? '').trim();
    const type = body.type;

    const deleted = reference !== '' && isRequestType(type) ? await deleteRequest(user.id, type, reference) : false;

    req.session.requestNotice = deleted ? 'deleted' : 'deleteFailed';
    req.session.save(() => res.redirect('/account'));
  }

  private forDisplay(request: RequestSummary, language: string | undefined) {
    return { ...request, submittedOn: this.formatDate(request.submittedAt, language) };
  }

  private formatDate(submittedAt: string, language: string | undefined): string {
    const date = new Date(submittedAt);

    if (Number.isNaN(date.getTime())) {
      return submittedAt;
    }

    return new Intl.DateTimeFormat(language === 'cy' ? 'cy-GB' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}
