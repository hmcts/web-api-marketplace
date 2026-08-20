import { randomBytes } from 'crypto';

import * as express from 'express';
import helmet from 'helmet';

export interface HelmetConfig {
  referrerPolicy?: ReferrerPolicy;
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
}

const self = "'self'";
const googleAnalyticsDomain = '*.google-analytics.com';
const tagManagerDomains = ['*.googletagmanager.com', 'https://tagmanager.google.com'];
const dynatraceDomain = 'https://*.dynatrace.com';
const azureBlobDomain = '*.blob.core.windows.net';

const blockedFeatures = ['camera', 'geolocation', 'microphone', 'interest-cohort'];

/**
 * Module that enables helmet in the application as well as custom settings for security headers
 * not handled by helmet.
 */
export class Helmet {
  constructor(
    private readonly config: HelmetConfig,
    private readonly developmentMode: boolean
  ) {}

  public enableFor(app: express.Express): void {
    // include default helmet functions
    app.use(helmet());

    // The main govuk template will use a nonce if we set one, and we can also use the same
    // nonce for embedded scripts to allow execution.
    //
    // <script {%- if cspNonce %} nonce="{{ cspNonce }}"{% endif %}>
    //   ...embedded js...
    // </script>
    //
    this.installNonceGenerator(app);

    this.setHSTSPolicy(app);
    this.setContentSecurityPolicy(app);
    this.setReferrerPolicy(app);
    this.setPermissionsPolicy(app);
  }

  private installNonceGenerator(app: express.Express) {
    // setup a nonce for script execution
    app.use((req, res, next) => {
      res.locals.cspNonce = randomBytes(32).toString('hex');
      next();
    });
  }

  private setHSTSPolicy(app: express.Express): void {
    app.use(
      helmet.hsts({
        maxAge: this.config.hsts?.maxAge ?? 31536000, // 1 year in seconds
        includeSubDomains: this.config.hsts?.includeSubDomains ?? true,
        preload: this.config.hsts?.preload ?? true,
      })
    );
  }

  private setContentSecurityPolicy(app: express.Express) {
    const scriptSrc = [
      self,
      googleAnalyticsDomain,
      ...tagManagerDomains,
      dynatraceDomain,
      (req, res) => `'nonce-${res['locals'].cspNonce}'`,
    ];

    if (this.developmentMode) {
      scriptSrc.push("'unsafe-eval'");
    }

    app.use(
      helmet.contentSecurityPolicy({
        directives: {
          connectSrc: [self, dynatraceDomain, googleAnalyticsDomain],
          defaultSrc: ["'none'"],
          manifestSrc: [self],
          fontSrc: [self, 'data:'],
          imgSrc: [self, googleAnalyticsDomain, azureBlobDomain],
          objectSrc: ["'none'"],
          scriptSrc,
          styleSrc: [self],
          workerSrc: [self, 'blob:'],
        },
      })
    );
  }

  private setReferrerPolicy(app: express.Express) {
    app.use(
      helmet.referrerPolicy({
        policy: this.config.referrerPolicy ?? 'same-origin',
      })
    );
  }

  private setPermissionsPolicy(app: express.Express): void {
    app.use((_req, res, next) => {
      res.setHeader('Permissions-Policy', blockedFeatures.map(f => f + '=()').join(', '));
      next();
    });
  }
}
