import { Response } from 'express';

import { AppRequest } from '../../../main/interfaces/AppRequest';
import { WEB_ADMIN, isWebAdmin, requireWebAdmin } from '../../../main/services/AdminRole';
import { SignedInUser } from '../../../main/services/SignIn';

const user = (roles?: string[]): SignedInUser => ({ id: 1, email: 'ada@example.net', name: 'Ada', roles });

const request = (signedInUser?: SignedInUser) =>
  ({ method: 'GET', originalUrl: '/admin', session: signedInUser ? { user: signedInUser } : {} }) as AppRequest;

const response = () => {
  const res = { status: jest.fn(), render: jest.fn(), redirect: jest.fn() };
  return res as unknown as Response & typeof res;
};

describe('isWebAdmin', () => {
  it('is true only for someone holding the role', () => {
    expect(isWebAdmin(user([WEB_ADMIN]))).toBe(true);
  });

  it('is false without the claim, with other roles, and with no user at all', () => {
    expect(isWebAdmin(user())).toBe(false);
    expect(isWebAdmin(user(['something_else']))).toBe(false);
    expect(isWebAdmin(undefined)).toBe(false);
  });
});

describe('requireWebAdmin', () => {
  it('lets an admin through', () => {
    const res = response();
    expect(requireWebAdmin(request(user([WEB_ADMIN])), res)).toBe(true);
    expect(res.render).not.toHaveBeenCalled();
  });

  it('answers a signed-in non-admin with not found, not a refusal', () => {
    const res = response();
    expect(requireWebAdmin(request(user()), res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.render).toHaveBeenCalledWith('not-found', {});
  });

  it('sends someone who is not signed in to sign in', () => {
    const res = response();
    expect(requireWebAdmin(request(), res)).toBe(false);
    expect(res.redirect).toHaveBeenCalledWith('/sign-in');
  });
});
