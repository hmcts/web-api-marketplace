import { GET, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireMarketplaceAdmin } from '../services/AdminRole';
import { AdminUser, AdminUserDetail, getAdminUser, listAdminUsers } from '../services/AdminUsers';
import { BackendError, Owner, ownerOf } from '../services/Applications';
import { formatDate } from '../services/Dates';
import { statusText } from '../services/LocalRequests';
import { SignedInUser } from '../services/SignIn';

const logger = Logger.getLogger('admin');

const NOT_KNOWN = 'Not known';
const ROW_ID = /^[0-9]{1,18}$/;

@route('/admin')
export default class AdminController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    res.render('admin');
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
      user: {
        name: found.name?.trim() || found.email,
        email: found.email,
        organisation: found.organisation || NOT_KNOWN,
        status: sentenceCase(found.status),
        joined: formatDate(found.createdAt) ?? NOT_KNOWN,
        lastSignedIn: formatDate(found.lastLoginAt) ?? NOT_KNOWN,
      },
      applications: found.applications.map(application => ({
        name: application.name,
        apis: `${application.apiCount} ${application.apiCount === 1 ? 'API' : 'APIs'}`,
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
