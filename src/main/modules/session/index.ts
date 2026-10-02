import crypto from 'node:crypto';

import { RedisStore } from 'connect-redis';
import express, { Response } from 'express';
import session from 'express-session';
import { createClient } from 'redis';

import { AppRequest } from '../../interfaces/AppRequest';
import { Logger } from '../logging';

const logger = Logger.getLogger('session');

export interface RedisOptions {
  host: string;
  port: string;
  key: string;
  tls: boolean;
}

export interface SessionOptions {
  secret: string;
  maxAgeMinutes: number;
  redis: RedisOptions;
}

export class Session {
  constructor(private readonly options: SessionOptions) {}

  public enableFor(app: express.Express): void {
    app.use(
      session({
        secret: this.secret(),
        store: this.store(),
        resave: false,
        saveUninitialized: false,
        rolling: true,
        name: 'connect.sid',
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: 'auto',
          maxAge: this.options.maxAgeMinutes * 60 * 1000,
        },
      })
    );
  }

  private store(): session.Store | undefined {
    const { host, port, key, tls } = this.options.redis;

    if (!host) {
      logger.info('No REDIS_HOST configured, holding sessions in memory for this process only');
      return undefined;
    }

    const client = createClient({
      url: `${tls ? 'rediss' : 'redis'}://${host}:${port}`,
      password: key || undefined,
      socket: tls ? { tls: true, servername: host } : {},
    });

    client.on('error', error => logger.error(`Redis connection error: ${error.message}`));
    client.on('ready', () => logger.info(`Sessions held in Redis at ${host}:${port}`));

    client.connect().catch(error => logger.error(`Could not connect to Redis at ${host}: ${error.message}`));

    return new RedisStore({ client, prefix: 'apim-marketplace-web:' });
  }

  private secret(): string {
    if (this.options.secret) {
      return this.options.secret;
    }

    logger.info('No SESSION_SECRET configured, generating one for this process');
    return crypto.randomBytes(32).toString('hex');
  }
}

export function requireSignIn(req: AppRequest, res: Response): boolean {
  if (req.session?.user) {
    return true;
  }

  // Only a page can be returned to. A POST's body is lost on the way through sign in, so
  // returning to its URL would land on a form with nothing in it.
  if (req.method === 'GET' && req.session) {
    req.session.returnTo = req.originalUrl;
  }
  res.redirect('/sign-in');
  return false;
}

/**
 * Where to send someone who has just signed in: back to the page sign in interrupted, if
 * there was one. Only ever a path on this service — `//elsewhere` and absolute URLs are
 * refused, so the value cannot be used to redirect off-site.
 */
export function takeReturnTo(req: AppRequest, fallback: string): string {
  const returnTo = req.session?.returnTo;
  delete req.session?.returnTo;

  return returnTo?.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/\\') ? returnTo : fallback;
}

/** Reads the one-off banner set by the page before, and clears it. */
export function takeNotice(req: AppRequest): { success: boolean; title: string; text: string } | undefined {
  const notice = req.session?.notice;
  delete req.session?.notice;
  return notice;
}
