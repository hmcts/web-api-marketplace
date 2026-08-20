import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

@route('/cookies')
export default class CookiesController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    const data = req.i18n?.getDataByLanguage(req.lng)?.cookies;
    res.render('cookies', data);
  }
}
