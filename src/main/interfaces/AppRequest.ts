import { Request } from 'express';
import { i18n } from 'i18next';

export interface AppRequest extends Request {
  i18n: i18n & {
    getDataByLanguage: (lng: string | undefined) => {
      template: object;
      home: object;
      cookies: object;
      notFound: object;
      error: object;
      accessibilityStatement: object;
    };
  };
  lng?: string;
}
