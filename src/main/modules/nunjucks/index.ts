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
    private readonly gtmContainerId: string = ''
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

    app.use((req, res, next) => {
      res.locals.pagePath = req.path;
      next();
    });
  }
}
