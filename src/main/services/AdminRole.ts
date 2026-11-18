import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { Logger } from '../modules/logging';
import { requireSignIn } from '../modules/session';

import { SignedInUser } from './SignIn';

const logger = Logger.getLogger('admin-role');

/**
 * The app role that opens the admin screens.
 *
 * It is declared on this app's registration and assigned to named people in the directory, so who
 * holds it is a question for Entra and never a list in this repository. The string has to read the
 * same here, in the token, and in the API that checks it, so it is written once.
 */
export const API_MARKETPLACE_ADMIN = 'api_marketplace_admin';

/** No roles claim means no roles: absence is the ordinary case, not an error. */
export function isMarketplaceAdmin(user: SignedInUser | undefined): boolean {
  return user?.roles?.includes(API_MARKETPLACE_ADMIN) === true;
}

/**
 * Guards an admin page, in the shape of `requireSignIn`: true means carry on, false means a
 * response has already been sent.
 *
 * Someone signed in without the role is answered with the same "not found" page as a URL that
 * does not exist. There is nothing to tell them: they cannot ask for the role here, and a page
 * that admits it exists invites a second look.
 */
export function requireMarketplaceAdmin(req: AppRequest, res: Response): boolean {
  if (!requireSignIn(req, res)) {
    return false;
  }
  if (isMarketplaceAdmin(req.session?.user)) {
    return true;
  }

  logger.warn(`Admin page refused: ${req.session?.user?.oid} does not hold ${API_MARKETPLACE_ADMIN}`);
  res.status(404);
  res.render('not-found', req.i18n?.getDataByLanguage(req.lng)?.['not-found'] ?? {});
  return false;
}
