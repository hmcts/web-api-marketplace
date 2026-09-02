import { Session, SessionData } from 'express-session';
import { stub } from 'sinon';

import { AppRequest } from '../../../main/interfaces/AppRequest';

/**
 * A session that behaves like express-session's for the parts controllers touch:
 * regenerate clears the stored data, save and destroy report success.
 */
export const mockSession = (data: Partial<SessionData> = {}): Session & Partial<SessionData> => {
  const session: Record<string, unknown> = { ...data };

  session.regenerate = (callback: (err?: unknown) => void) => {
    delete session.user;
    callback();
    return session;
  };
  session.save = (callback?: (err?: unknown) => void) => {
    callback?.();
    return session;
  };
  session.destroy = (callback?: (err?: unknown) => void) => {
    delete session.user;
    callback?.();
    return session;
  };

  return session as never;
};

export const mockRequest = (data: unknown, session: Partial<SessionData> = {}): AppRequest => {
  const req: Partial<AppRequest> = {
    body: {},
    i18n: {
      getDataByLanguage: stub().returns(data),
    } as unknown as AppRequest['i18n'],
    lng: 'en',
    params: {},
    query: {},
    cookies: {},
    session: mockSession(session),
  };

  return req as unknown as AppRequest;
};
