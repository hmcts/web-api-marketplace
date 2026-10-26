import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireSignIn } from '../modules/session';
import { ownerOf } from '../services/Applications';
import { listLocalRequests, statusText } from '../services/LocalRequests';
import { listProductionRequests } from '../services/ProductionRequests';
import { RequestSummary, getRequestsFor } from '../services/Requests';
import { SignedInUser } from '../services/SignIn';

const logger = Logger.getLogger('account');

type Row = RequestSummary & { href?: string };

@route('/account')
export default class AccountController {
  @GET()
  public async get(req: AppRequest, res: Response): Promise<void> {
    if (!requireSignIn(req, res)) {
      return;
    }

    const user = req.session.user as SignedInUser;
    // An account registered here is unknown to the backend, which would refuse its id.
    const result = user.local ? { ok: true, requests: [] } : await getRequestsFor(user.id);
    const production = await this.productionRequests(user);
    const local = (await listLocalRequests(user.email)).filter(request => request.type !== 'PRODUCTION');
    const requests: Row[] = [
      ...result.requests,
      ...production.requests.map(request => ({
        reference: request.reference,
        type: 'PRODUCTION' as const,
        submittedAt: request.submittedAt,
        status: statusText(request.status),
        href: `/account/production-credentials/${request.reference}`,
      })),
      ...local.map(request => ({
        reference: request.reference,
        type: request.type,
        submittedAt: request.submittedAt,
        status: statusText(request.status),
        href: undefined,
      })),
    ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    res.render('account', {
      ...req.i18n?.getDataByLanguage(req.lng)?.account,
      user,
      myRequests: requests.map(request => this.forDisplay(request)),
      couldNotLoad: !result.ok || !production.ok,
    });
  }

  private async productionRequests(
    user: SignedInUser
  ): Promise<{ ok: boolean; requests: { reference: string; status: string; submittedAt: string }[] }> {
    try {
      return { ok: true, requests: await listProductionRequests(ownerOf(user)) };
    } catch (error) {
      logger.error(`Could not list production requests: ${(error as Error).message}`);
      return { ok: false, requests: [] };
    }
  }

  private forDisplay(request: Row) {
    return { ...request, submittedOn: this.formatDate(request.submittedAt) };
  }

  private formatDate(submittedAt: string): string {
    const date = new Date(submittedAt);

    if (Number.isNaN(date.getTime())) {
      return submittedAt;
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}
