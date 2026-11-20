import { randomBytes, timingSafeEqual } from 'node:crypto';

import { Application, NextFunction, Request, Response } from 'express';

import { Logger } from '../logging';

export const CSRF_FIELD = '_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const logger = Logger.getLogger('csrf');

/**
 * A token per signed-in session, sent back with every form (`_csrf`) and script request
 * (`X-CSRF-Token`) that changes something. Only signed-in requests are checked: every
 * route that changes something already requires sign in, and an attacker gains nothing
 * by forging a request from a browser that is not signed in.
 */
export class Csrf {
  public constructor(private readonly enabled: boolean) {}

  public enableFor(app: Application): void {
    if (this.enabled) {
      app.use(csrfProtection);
    }
  }
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  res.locals.csrfToken = tokenFor(req);

  if (SAFE_METHODS.has(req.method) || !req.session?.user) {
    next();
    return;
  }

  const sent = (req.body as Record<string, unknown> | undefined)?.[CSRF_FIELD] ?? req.get(CSRF_HEADER);
  if (typeof sent === 'string' && matches(sent, req.session.csrfToken)) {
    next();
    return;
  }

  logger.warn(`Refused ${req.method} ${req.path}: missing or wrong CSRF token`);
  next(Object.assign(new Error('The form has expired. Go back, refresh the page and try again.'), { status: 403 }));
}

/** The hidden field each POST form carries; `csrfField()` in templates. */
export function csrfFieldHtml(token: string): string {
  const value = token.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<input type="hidden" name="${CSRF_FIELD}" value="${value}">`;
}

function tokenFor(req: Request): string {
  if (!req.session?.user) {
    return '';
  }
  req.session.csrfToken ??= randomBytes(32).toString('base64url');
  return req.session.csrfToken;
}

function matches(sent: string, expected: string | undefined): boolean {
  if (!expected) {
    return false;
  }
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
