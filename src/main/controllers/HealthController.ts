import { GET, route } from 'awilix-express';
import { Request, Response } from 'express';

import { app as myApp } from '../app';

const healthcheck = require('@hmcts/nodejs-healthcheck');
const outputs = require('@hmcts/nodejs-healthcheck/healthcheck/outputs');
const healthRoutes = require('@hmcts/nodejs-healthcheck/healthcheck/routes');

@route('/health')
export default class HealthController {
  private readonly healthCheckConfig = {
    checks: {
      // TODO: replace this sample check with proper checks for your application
      sampleCheck: healthcheck.raw(() => healthcheck.up()),
    },
    readinessChecks: {
      shutdownCheck: healthcheck.raw(() => {
        return this.shutdownCheck() ? healthcheck.down() : healthcheck.up();
      }),
    },
  };

  @GET()
  public get(req: Request, res: Response): void {
    return healthRoutes.configure(this.healthCheckConfig)(req, res);
  }

  @route('/liveness')
  @GET()
  public liveness(_req: Request, res: Response): void {
    res.json(outputs.status(outputs.UP));
  }

  @route('/readiness')
  @GET()
  public readiness(req: Request, res: Response): void {
    return healthRoutes.checkReadiness(this.healthCheckConfig.readinessChecks)(req, res);
  }

  private shutdownCheck(): boolean {
    return myApp.locals.shutdown;
  }
}
