import { Response } from 'express';

import { AppRequest } from '../../../main/interfaces/AppRequest';
import { API_MARKETPLACE_ADMIN, isMarketplaceAdmin, requireMarketplaceAdmin } from '../../../main/services/AdminRole';
import { SignedInUser } from '../../../main/services/SignIn';

const user = (roles?: string[]): SignedInUser => ({ id: 1, email: 'ada@example.net', name: 'Ada', roles });

const request = (signedInUser?: SignedInUser) =>
  ({ method: 'GET', originalUrl: '/admin', session: signedInUser ? { user: signedInUser } : {} }) as AppRequest;

const response = () => {
  const res = { status: jest.fn(), render: jest.fn(), redirect: jest.fn() };
  return res as unknown as Response & typeof res;
};

describe('isMarketplaceAdmin', () => {
  it('is true only for someone holding the role', () => {
    expect(isMarketplaceAdmin(user([API_MARKETPLACE_ADMIN]))).toBe(true);
  });

  it('is false without the claim, with other roles, and with no user at all', () => {
    expect(isMarketplaceAdmin(user())).toBe(false);
    expect(isMarketplaceAdmin(user(['something_else']))).toBe(false);
    expect(isMarketplaceAdmin(undefined)).toBe(false);
  });
});

describe('requireMarketplaceAdmin', () => {
  it('lets an admin through', () => {
    const res = response();
    expect(requireMarketplaceAdmin(request(user([API_MARKETPLACE_ADMIN])), res)).toBe(true);
    expect(res.render).not.toHaveBeenCalled();
  });

  it('answers a signed-in non-admin with not found, not a refusal', () => {
    const res = response();
    expect(requireMarketplaceAdmin(request(user()), res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.render).toHaveBeenCalledWith('not-found', {});
  });

  it('sends someone who is not signed in to sign in', () => {
    const res = response();
    expect(requireMarketplaceAdmin(request(), res)).toBe(false);
    expect(res.redirect).toHaveBeenCalledWith('/sign-in');
  });
});
