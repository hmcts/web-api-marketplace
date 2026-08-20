import * as os from 'os';

import { infoRequestHandler } from '@hmcts/info-provider';
import { GET, route } from 'awilix-express';
import { NextFunction, Request, Response } from 'express';

@route('/info')
export default class InfoController {
  @GET()
  public async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    infoRequestHandler({
      extraBuildInfo: {
        host: os.hostname(),
        name: 'API Marketplace Public Frontend',
        uptime: process.uptime(),
      },
      info: {},
    })(req, res, next);
  }
}
