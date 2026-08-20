import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

@route('/')
export default class HomeController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    const data = req.i18n?.getDataByLanguage(req.lng)?.home;
    res.render('home', data);
  }
}
