import { GET, route } from 'awilix-express';
import { Request, Response } from 'express';

/**
 * Content pages ported from the API Marketplace prototype. As elsewhere in the ported
 * sections, the copy lives in the templates rather than the locale files — it is long-form
 * prose rather than UI strings.
 */
@route('/help')
export default class HelpController {
  @GET()
  public get(req: Request, res: Response): void {
    res.render('help/index');
  }

  @route('/resources')
  @GET()
  public resources(req: Request, res: Response): void {
    res.render('help/resources');
  }
}
