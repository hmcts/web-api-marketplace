import { SessionData } from 'express-session';

import { AppRequest } from '../../../main/interfaces/AppRequest';
import { mockRequest } from '../mocks/mockRequest';

/** A user signed in through Entra, as the session holds them once through the welcome. */
export const LOCAL_USER = {
  id: 0,
  local: true,
  oid: '11111111-2222-3333-4444-555555555555',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
};

export const CATALOGUE = [
  { name: 'api-one', title: 'API one', description: 'The first API.', team: 'team-one' },
  { name: 'api-two', title: 'API two' },
];

interface RequestParts {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  session?: Partial<SessionData>;
}

/** A request from a signed-in local user, with whatever body, params and session it needs. */
export function asUser(parts: RequestParts = {}): AppRequest {
  return build({ ...parts, session: { user: LOCAL_USER as never, ...parts.session } });
}

/** A request with no one signed in. */
export function anonymous(parts: RequestParts = {}): AppRequest {
  return build(parts);
}

function build({ body = {}, params = {}, query = {}, session = {} }: RequestParts): AppRequest {
  const req = mockRequest({}, session);
  req.body = body;
  req.params = params;
  req.query = query;
  return req;
}
