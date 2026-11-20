import { NextFunction, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireSignIn } from '../modules/session';

import { isAdmin } from './SignIn';

/** False once it has answered: signed out goes to sign in, anyone else signed in gets the app's 404. */
export function requireAdmin(req: AppRequest, res: Response, next: NextFunction): boolean {
  if (!requireSignIn(req, res)) {
    return false;
  }

  if (!isAdmin(req.session.user)) {
    next();
    return false;
  }

  return true;
}
