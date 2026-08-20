import { stub } from 'sinon';

import { AppRequest } from '../../../main/interfaces/AppRequest';

export const mockRequest = (data: unknown): AppRequest => {
  const req: Partial<AppRequest> = {
    body: {},
    i18n: {
      getDataByLanguage: stub().returns(data),
    } as unknown as AppRequest['i18n'],
    lng: 'en',
    params: {},
    query: {},
    cookies: {},
  };

  return req as unknown as AppRequest;
};
