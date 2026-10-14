import express, { NextFunction, Response } from 'express';
import i18next, { Resource, init } from 'i18next';
import { handle } from 'i18next-http-middleware';
import requireDir from 'require-directory';

import { AppRequest } from '../../interfaces/AppRequest';

const resources = requireDir(module, '../../', {
  include: /locales/,
}).locales as Resource;

/**
 * The page text, from locales/en. The service is in English only, so there is no language
 * to detect: no ?lng= switch and no language cookie.
 */
export class I18next {
  constructor() {
    const options = {
      lng: 'en',
      preload: ['en'],
      resources,
      fallbackLng: 'en',
      supportedLngs: ['en'],
      showSupportNotice: false,
    };

    init(options);
  }

  public enableFor(app: express.Express): void {
    app.use(handle(i18next));
    app.use(((req: AppRequest, res: Response, next: NextFunction) => {
      Object.assign(res.locals, req.i18n?.getDataByLanguage(req.lng)?.template);
      res.locals.htmlLang = req.lng;
      next();
    }) as express.RequestHandler);
  }
}
