import { Response } from 'express';

import SignOutController from '../../../main/controllers/SignOutController';
import { mockRequest } from '../mocks/mockRequest';

const user = { email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

function mockResponse(): Response & { redirected?: string; cleared?: string } {
  const res: Record<string, unknown> = {};
  res.clearCookie = jest.fn().mockImplementation((name: string) => {
    res.cleared = name;
  });
  res.redirect = jest.fn().mockImplementation((to: string) => {
    res.redirected = to;
  });
  return res as never;
}

describe('SignOutController', () => {
  test('signing_out_should_destroy_the_session_and_redirect_home', () => {
    const res = mockResponse();
    const req = mockRequest({}, { user });

    new SignOutController().post(req, res);

    expect(req.session.user).toBeUndefined();
    expect(res.cleared).toBe('connect.sid');
    expect(res.redirected).toBe('/');
  });
});
