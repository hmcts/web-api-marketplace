import { GET, route } from 'awilix-express';
import { Request, Response } from 'express';

/**
 * Content pages ported from the API Marketplace prototype. The copy lives in the templates
 * rather than the locale files — these are long-form prose rather than UI strings, and
 * extracting them is a job for whenever Welsh is actually commissioned.
 */
@route('/get-started')
export default class GetStartedController {
  @GET()
  public get(req: Request, res: Response): void {
    res.render('get-started/index');
  }

  @route('/building-software')
  @GET()
  public buildingSoftware(req: Request, res: Response): void {
    res.render('get-started/building-software');
  }

  @route('/consumer-guidance')
  @GET()
  public consumerGuidance(req: Request, res: Response): void {
    res.render('get-started/consumer-guidance');
  }

  @route('/glossary')
  @GET()
  public glossary(req: Request, res: Response): void {
    res.render('get-started/glossary');
  }

  @route('/onboarding-guide')
  @GET()
  public onboardingGuide(req: Request, res: Response): void {
    res.render('get-started/onboarding-guide');
  }

  @route('/technology-introduction')
  @GET()
  public technologyIntroduction(req: Request, res: Response): void {
    res.render('get-started/technology-introduction');
  }
}
