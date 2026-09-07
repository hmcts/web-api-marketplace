import * as path from 'path';

import * as express from 'express';
import * as nunjucks from 'nunjucks';

import { Logger } from '../logging';

export interface DynatraceOptions {
  jstagKey: string;
  jstags: {
    [index: string]: string;
  };
}

const logger = Logger.getLogger('nunjucks');

export class Nunjucks {
  private readonly jstag: string;
  constructor(
    dynatrace: DynatraceOptions,
    public readonly developmentMode: boolean,
    private readonly gtmContainerId: string = '',
    /**
     * The public marketplace site the service name in the header links back to.
     *
     * Configured rather than written into the template because the address has already
     * moved once — it was served from /v2/ before moving to the root of the same host —
     * so the next move is a MARKETPLACE_SITE_URL change on the deployment rather than a
     * code change and a release.
     */
    private readonly marketplaceSiteUrl: string = ''
  ) {
    // Both tags are optional — the template only renders a script when one is configured.
    this.jstag = dynatrace?.jstags?.[dynatrace.jstagKey] ?? '';
  }

  enableFor(app: express.Express): void {
    app.set('view engine', 'njk');
    const govukTemplates = path.dirname(require.resolve('govuk-frontend/package.json')) + '/dist';
    const viewsPath = path.join(__dirname, '..', '..', 'views');

    const env = nunjucks.configure([govukTemplates, viewsPath], {
      autoescape: true,
      watch: this.developmentMode,
      express: app,
    });
    env.addGlobal('govukRebrand', true);
    logger.info(this.jstag ? `using jstag: ${this.jstag}` : 'no Dynatrace jstag configured');
    env.addGlobal('jstag', this.jstag);
    env.addGlobal('gtmContainerId', this.gtmContainerId);
    // Falls back to this service's own root, so an unset or empty configuration leaves the
    // crown pointing somewhere real rather than at an empty href.
    env.addGlobal('marketplaceSiteUrl', this.marketplaceSiteUrl || '/');

    app.use((req, res, next) => {
      res.locals.pagePath = req.path;
      next();
    });
  }
}
