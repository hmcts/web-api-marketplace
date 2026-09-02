import { GET, route } from 'awilix-express';
import { Request, Response } from 'express';

/**
 * Content pages ported from the API Marketplace prototype. As with Get started, the copy
 * lives in the templates rather than the locale files — it is long-form prose rather than
 * UI strings, and extracting it is a job for whenever Welsh is actually commissioned.
 */
@route('/publish')
export default class PublishController {
  @GET()
  public get(req: Request, res: Response): void {
    res.render('publish/index');
  }

  @route('/producer-standards')
  @GET()
  public producerStandards(req: Request, res: Response): void {
    res.render('publish/producer-standards');
  }

  @route('/data-governance')
  @GET()
  public dataGovernance(req: Request, res: Response): void {
    res.render('publish/data-governance');
  }
}
