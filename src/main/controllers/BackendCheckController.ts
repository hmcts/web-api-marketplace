import { GET, route } from 'awilix-express';
import { Request, Response } from 'express';

import { backendPath, backendUrl, checkBackendHealth } from '../services/BackendHealth';

@route('/backend-check')
export default class BackendCheckController {
  @GET()
  public async get(req: Request, res: Response): Promise<void> {
    const result = await checkBackendHealth();

    res.status(result.ok ? 200 : 502).json({ ...result, url: `${backendUrl}${backendPath}` });
  }
}
