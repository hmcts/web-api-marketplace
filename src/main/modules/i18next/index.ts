import express, { NextFunction, Response } from 'express';
import i18next, { Resource, use } from 'i18next';
import { LanguageDetector, handle } from 'i18next-http-middleware';
import requireDir from 'require-directory';

import { AppRequest } from '../../interfaces/AppRequest';

const resources = requireDir(module, '../../', {
  include: /locales/,
}).locales as Resource;

export class I18next {
  constructor() {
    const options = {
      preload: ['en', 'cy'],
      resources,
      fallbackLng: 'en',
      supportedLngs: ['en', 'cy'],
      showSupportNotice: false,
      detection: {
        order: ['querystring', 'cookie'],
        caches: ['cookie'],
      },
    };

    use(LanguageDetector).init(options);
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
