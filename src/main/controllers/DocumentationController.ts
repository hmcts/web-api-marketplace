import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

@route('/documentation')
export default class DocumentationController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    res.render('documentation', req.i18n?.getDataByLanguage(req.lng)?.documentation);
  }
}
