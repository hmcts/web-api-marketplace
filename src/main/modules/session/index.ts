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

  res.redirect('/sign-in');
  return false;
}
