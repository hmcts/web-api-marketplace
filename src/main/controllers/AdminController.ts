import { GET, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import {
  AdminApplicationDetail,
  AdminApplicationOwner,
  AdminApplicationSummary,
  getAdminApplication,
  listAdminApplications,
} from '../services/AdminApplications';
import {
  AdminProductionRequestDetail,
  AdminProductionRequestSummary,
  getAdminProductionRequest,
  listAdminProductionRequests,
} from '../services/AdminProductionRequests';
import { requireMarketplaceAdmin } from '../services/AdminRole';
import { AdminUser, AdminUserDetail, getAdminUser, listAdminUsers } from '../services/AdminUsers';
import { BackendError, Owner, ownerOf } from '../services/Applications';
import { formatDate } from '../services/Dates';
import { statusText } from '../services/LocalRequests';
import { ORGANISATION_TYPES, answerLabel, storedAnswerRows } from '../services/ProductionRequestAnswers';
import { SignedInUser } from '../services/SignIn';

const logger = Logger.getLogger('admin');

const NOT_KNOWN = 'Not known';
const UNKNOWN_COUNT = '—';
const ROW_ID = /^[0-9]{1,18}$/;
const REFERENCE = /^PCR-[A-Z0-9]{8}$/;
/** Every status a request can hold, in the order a request moves through them. */
const STATUSES = ['SUBMITTED', 'IN_REVIEW', 'MORE_INFORMATION_NEEDED', 'APPROVED', 'DECLINED'];

@route('/admin')
export default class AdminController {
  @GET()
  public async get(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    let users: AdminUser[] | undefined = [];
    let applications: AdminApplicationSummary[] | undefined;
    let requests: AdminProductionRequestSummary[] | undefined;
    let couldNotLoad = false;
    try {
      [users, applications, requests] = await Promise.all([
        listAdminUsers(owner(req)),
        countable(req, 'applications', listAdminApplications),
        countable(req, 'production requests', listAdminProductionRequests),
      ]);
    } catch (error) {
      if (tokenRefused(error)) {
        signInAgain(req, res);
        return;
      }
      logger.error(`Could not count the marketplace for an admin: ${(error as Error).message}`);
      couldNotLoad = true;
    }

    if (!users) {
      next();
      return;
    }

    res.render('admin', {
      // A dash says a figure is not known yet rather than claiming none exist.
      counts: {
        users: users.length,
        applications: applications?.length ?? UNKNOWN_COUNT,
        productionRequests: requests?.length ?? UNKNOWN_COUNT,
      },
      couldNotLoad,
    });
  }

  @route('/users')
  @GET()
  public async users(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    let users: AdminUser[] | undefined = [];
    let couldNotLoad = false;
    try {
      users = await listAdminUsers(owner(req));
    } catch (error) {
      if (tokenRefused(error)) {
        signInAgain(req, res);
        return;
      }
      logger.error(`Could not list users for an admin: ${(error as Error).message}`);
      couldNotLoad = true;
    }

    if (!users) {
      next();
      return;
    }

    const rows = users
      .filter(user => matches(user, q))
      .map(user => ({
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
        joined: formatDate(user.createdAt) ?? NOT_KNOWN,
        lastSignedIn: formatDate(user.lastLoginAt) ?? NOT_KNOWN,
        applications: user.applicationCount,
      }));

    res.render('admin/users', { q, count: rows.length, users: rows, couldNotLoad });
  }

  @route('/users/:id')
  @GET()
  public async user(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    const id = String(req.params.id);
    if (!ROW_ID.test(id)) {
      next();
      return;
    }

    let found: AdminUserDetail | undefined;
    try {
      found = await getAdminUser(owner(req), Number(id));
    } catch (error) {
      if (tokenRefused(error)) {
        signInAgain(req, res);
        return;
      }
      logger.error(`Could not read user ${id} for an admin: ${(error as Error).message}`);
      res.render('admin/user', { couldNotLoad: true, applications: [], productionRequests: [] });
      return;
    }

    if (!found) {
      next();
      return;
    }

    res.render('admin/user', {
      // Not `user`: the layout reads that as the signed-in admin, to decide on the Admin tab.
      person: {
        name: found.name?.trim() || found.email,
        email: found.email,
        organisation: found.organisation || NOT_KNOWN,
        status: sentenceCase(found.status),
        joined: formatDate(found.createdAt) ?? NOT_KNOWN,
        lastSignedIn: formatDate(found.lastLoginAt) ?? NOT_KNOWN,
      },
      applications: found.applications.map(application => ({
        name: application.name,
        apis: apiCount(application.apiCount),
        created: formatDate(application.createdAt) ?? NOT_KNOWN,
      })),
      productionRequests: found.productionRequests.map(request => ({
        reference: request.reference,
        applicationName: request.applicationName,
        status: statusText(request.status),
        submitted: formatDate(request.submittedAt) ?? NOT_KNOWN,
      })),
      couldNotLoad: false,
    });
  }

  @route('/applications')
  @GET()
  public async applications(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    let applications: AdminApplicationSummary[] | undefined = [];
    let couldNotLoad = false;
    try {
      applications = await listAdminApplications(owner(req));
    } catch (error) {
      if (tokenRefused(error)) {
        signInAgain(req, res);
        return;
      }
      logger.error(`Could not list applications for an admin: ${(error as Error).message}`);
      couldNotLoad = true;
    }

    if (!applications) {
      next();
      return;
    }

    const rows = applications.map(application => ({
      id: application.id,
      name: application.name,
      owner: ownerView(application.owner),
      apis: apiCount(application.apiCount),
      created: formatDate(application.createdAt) ?? NOT_KNOWN,
      productionRequested: application.productionRequested,
    }));

    res.render('admin/applications', { count: rows.length, applications: rows, couldNotLoad });
  }

  @route('/applications/:id')
  @GET()
  public async application(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    const id = String(req.params.id);
    if (!ROW_ID.test(id)) {
      next();
      return;
    }

    let found: AdminApplicationDetail | undefined;
    try {
      found = await getAdminApplication(owner(req), Number(id));
    } catch (error) {
      if (tokenRefused(error)) {
        signInAgain(req, res);
        return;
      }
      logger.error(`Could not read application ${id} for an admin: ${(error as Error).message}`);
      res.render('admin/application', { couldNotLoad: true });
      return;
    }

    if (!found) {
      next();
      return;
    }

    const request = found.productionRequest;
    res.render('admin/application', {
      application: {
        name: found.name,
        owner: ownerView(found.owner),
        created: formatDate(found.createdAt) ?? NOT_KNOWN,
        clientId: found.clientId,
        apis: found.apis,
      },
      productionRequest: request
        ? {
            reference: request.reference,
            status: statusText(request.status),
            submitted: formatDate(request.submittedAt) ?? NOT_KNOWN,
          }
        : undefined,
      couldNotLoad: false,
    });
  }

  @route('/production-requests')
  @GET()
  public async productionRequests(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    const status = typeof req.query.status === 'string' && STATUSES.includes(req.query.status) ? req.query.status : '';
    let requests: AdminProductionRequestSummary[] | undefined = [];
    let couldNotLoad = false;
    try {
      requests = await listAdminProductionRequests(owner(req));
    } catch (error) {
      if (tokenRefused(error)) {
        signInAgain(req, res);
        return;
      }
      logger.error(`Could not list production requests for an admin: ${(error as Error).message}`);
      couldNotLoad = true;
    }

    if (!requests) {
      next();
      return;
    }

    const rows = requests
      .filter(request => !status || request.status === status)
      .map(request => ({
        reference: request.reference,
        applicationId: request.applicationId ?? undefined,
        applicationName: request.applicationName,
        organisation: request.organisation,
        submitted: formatDate(request.submittedAt) ?? NOT_KNOWN,
        status: statusText(request.status),
      }));

    res.render('admin/production-requests', {
      status,
      statuses: [
        { value: '', text: 'All statuses', selected: !status },
        ...STATUSES.map(value => ({ value, text: statusText(value), selected: value === status })),
      ],
      count: rows.length,
      requests: rows,
      couldNotLoad,
    });
  }

  @route('/production-requests/:reference')
  @GET()
  public async productionRequest(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    const reference = String(req.params.reference);
    if (!REFERENCE.test(reference)) {
      next();
      return;
    }

    let found: AdminProductionRequestDetail | undefined;
    try {
      found = await getAdminProductionRequest(owner(req), reference);
    } catch (error) {
      if (tokenRefused(error)) {
        signInAgain(req, res);
        return;
      }
      logger.error(`Could not read production request ${reference} for an admin: ${(error as Error).message}`);
      res.render('admin/production-request', { couldNotLoad: true });
      return;
    }

    if (!found) {
      next();
      return;
    }

    res.render('admin/production-request', {
      request: {
        reference: found.reference,
        status: statusText(found.status),
        submitted: formatDate(found.submittedAt) ?? NOT_KNOWN,
        requester: ownerView(found.requester),
        organisationType: found.organisationType ? answerLabel(ORGANISATION_TYPES, found.organisationType) : undefined,
        organisation: found.organisation,
        applicationId: found.applicationId ?? undefined,
        applicationName: found.applicationName,
        apis: found.apis.join(', ') || 'None',
      },
      answers: storedAnswerRows({
        goLiveDate: found.goLiveDate,
        callVolume: found.callVolume,
        dataRequest: found.dataRequest ?? '',
        dataRecipients: found.dataRecipients,
        dataRecipientsExplanation: found.dataRecipientsExplanation ?? undefined,
        dataCombined: found.dataCombined ?? undefined,
        dataCombinedDescription: found.dataCombinedDescription ?? undefined,
        proposedOutputs: found.proposedOutputs ?? undefined,
      }),
      couldNotLoad: false,
    });
  }
}

/** The dashboard counts what it can; a failure there leaves a dash, not a broken page. */
async function countable<T>(
  req: AppRequest,
  what: string,
  list: (owner: Owner) => Promise<T[] | undefined>
): Promise<T[] | undefined> {
  try {
    return await list(owner(req));
  } catch (error) {
    if (tokenRefused(error)) {
      throw error;
    }
    logger.error(`Could not count ${what} for an admin: ${(error as Error).message}`);
    return undefined;
  }
}

function ownerView(found?: AdminApplicationOwner | null): { id: number; name: string; email: string } | undefined {
  return found ? { id: found.id, name: found.name?.trim() || found.email, email: found.email } : undefined;
}

function apiCount(count: number): string {
  return `${count} ${count === 1 ? 'API' : 'APIs'}`;
}

function owner(req: AppRequest): Owner {
  return ownerOf(req.session.user as SignedInUser, req.session.idToken);
}

function tokenRefused(error: unknown): boolean {
  return error instanceof BackendError && error.status === 401;
}

function signInAgain(req: AppRequest, res: Response): void {
  req.session.destroy(() => res.redirect('/sign-in'));
}

function sentenceCase(value?: string): string {
  if (!value) {
    return NOT_KNOWN;
  }
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function matches(user: AdminUser, q: string): boolean {
  const wanted = q.toLowerCase();
  return !wanted || `${user.name ?? ''}\n${user.email}`.toLowerCase().includes(wanted);
}
