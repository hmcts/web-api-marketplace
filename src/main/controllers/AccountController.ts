import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { RequestSummary, getRequestsFor } from '../services/Requests';

@route('/account')
export default class AccountController {
  @GET()
  public async get(req: AppRequest, res: Response): Promise<void> {
    if (!req.session?.user) {
      res.redirect('/sign-in');
      return;
    }

    const result = await getRequestsFor(req.session.user.id);

    res.render('account', {
      ...req.i18n?.getDataByLanguage(req.lng)?.account,
      user: req.session.user,
      myRequests: result.requests.map(request => this.forDisplay(request, req.lng)),
      couldNotLoad: !result.ok,
    });
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
