import crypto from 'crypto';

import express from 'express';
import session from 'express-session';

import { Logger } from '../logging';

const logger = Logger.getLogger('session');

export interface SessionOptions {
  secret: string;
  maxAgeMinutes: number;
}

/**
 * Server-side session, holding the signed-in user.
 *
 * The store is express-session's in-memory default. That is sound while the chart runs a
 * single replica with autoscaling off: sessions do not need to be shared, and a pod
 * restart signing everyone out is acceptable in beta. It is also the thing that has to
 * change first if this ever scales — with two replicas a user's requests would land on
 * whichever pod the load balancer picked, and they would appear to sign in and out at
 * random. Swap in a shared store (Redis) before raising `replicas`.
 *
 * The cookie keeps express-session's default name, `connect.sid`, deliberately: the Front
 * Door WAF inspects cookie values, and that name is already in the global_exclusions for
 * this host in azure-platform-terraform. A different name would need a terraform change
 * first, or every signed-in request would get a 403.
 */
export class Session {
  constructor(private readonly options: SessionOptions) {}

  public enableFor(app: express.Express): void {
    app.use(
      session({
        secret: this.secret(),
        resave: false,
        // No cookie until something is actually stored, so anonymous visitors get none and
        // the session cookie only ever exists as a strictly necessary one.
        saveUninitialized: false,
        rolling: true,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          // 'auto' rather than a fixed true: behind the App Gateway `req.secure` is true
          // via X-Forwarded-Proto (see `trust proxy`), while plain http://localhost in
          // local development still gets a usable cookie.
          secure: 'auto',
          maxAge: this.options.maxAgeMinutes * 60 * 1000,
        },
      })
    );
  }

  private secret(): string {
    if (this.options.secret) {
      return this.options.secret;
    }

    // Generated rather than defaulted to a literal, so no signing key is ever committed.
    // Regenerating on boot invalidates existing sessions, which the in-memory store does
    // anyway. Set SESSION_SECRET once sessions must outlive a restart.
    logger.info('No SESSION_SECRET configured, generating one for this process');
    return crypto.randomBytes(32).toString('hex');
  }
}
