import { GET, route } from 'awilix-express';
import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireAdmin } from '../services/AdminGuard';
import { AdminUser, listAdminUsers } from '../services/AdminUsers';
import { ownerOf } from '../services/Applications';
import { formatDate } from '../services/Dates';
import { SignedInUser } from '../services/SignIn';

const logger = Logger.getLogger('admin');

const NOT_KNOWN = 'Not known';

@route('/admin')
export default class AdminController {
  @GET()
  public get(req: AppRequest, res: Response, next: NextFunction): void {
    if (!requireAdmin(req, res, next)) {
      return;
    }

    res.render('admin');
  }

  @route('/users')
  @GET()
  public async users(req: AppRequest, res: Response, next: NextFunction): Promise<void> {
    if (!requireAdmin(req, res, next)) {
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    let users: AdminUser[] = [];
    let couldNotLoad = false;
    try {
      users = await listAdminUsers(ownerOf(req.session.user as SignedInUser));
    } catch (error) {
      logger.error(`Could not list users for an admin: ${(error as Error).message}`);
      couldNotLoad = true;
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
}

function matches(user: AdminUser, q: string): boolean {
  const wanted = q.toLowerCase();
  return !wanted || `${user.name ?? ''}\n${user.email}`.toLowerCase().includes(wanted);
}
