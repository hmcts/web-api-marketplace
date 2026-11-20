import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';
import { requireMarketplaceAdmin } from '../services/AdminRole';

@route('/admin')
export default class AdminController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    if (!requireMarketplaceAdmin(req, res)) {
      return;
    }

    res.render('admin');
  }
}
