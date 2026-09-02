import { GET, route } from 'awilix-express';
import { Request, Response } from 'express';

import { AppRequest } from '../interfaces/AppRequest';

@route('/documentation')
export default class DocumentationController {
  @GET()
  public get(req: AppRequest, res: Response): void {
    res.render('documentation/index', req.i18n?.getDataByLanguage(req.lng)?.documentation);
  }

  // The sub-pages below are content ported from the prototype, so their copy lives in the
  // templates rather than the locale files — unlike the index above, which was written
  // here and is translated.
  @route('/architecture')
  @GET()
  public architecture(req: Request, res: Response): void {
    res.render('documentation/architecture');
  }

  @route('/architecture-principles')
  @GET()
  public architecturePrinciples(req: Request, res: Response): void {
    res.render('documentation/architecture-principles');
  }

  @route('/case-studies')
  @GET()
  public caseStudies(req: Request, res: Response): void {
    res.render('documentation/case-studies');
  }

  @route('/our-api-technologies')
  @GET()
  public ourApiTechnologies(req: Request, res: Response): void {
    res.render('documentation/our-api-technologies');
  }

  @route('/our-capabilities')
  @GET()
  public ourCapabilities(req: Request, res: Response): void {
    res.render('documentation/our-capabilities');
  }
}
