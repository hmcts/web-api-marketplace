import { GET, route } from 'awilix-express';
import { Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

/**
 * Registration is linked from the sign-in page but has no journey behind it yet. A
 * placeholder saying so beats the "page not found" a visitor gets otherwise, which reads
 * as a broken link rather than an unfinished feature.
 *
 * Served as 200 rather than 501: the response is a deliberate, correct one, and a 5xx here
 * would land in the platform's error-rate dashboards and alerting as if the app had failed.
 */
@route('/register')
export default class RegisterController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    res.render('not-implemented', req.i18n?.getDataByLanguage(req.lng)?.notImplemented);
  }
}
