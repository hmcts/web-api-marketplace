import { Response } from 'express';

import { AppRequest } from '../../../main/interfaces/AppRequest';
import {
  AMP_ADMIN,
  adminRequestHeaders,
  isMarketplaceAdmin,
  requireMarketplaceAdmin,
} from '../../../main/services/AdminRole';
import { SignedInUser } from '../../../main/services/SignIn';

const user = (roles?: string[]): SignedInUser => ({ id: 1, email: 'ada@example.net', name: 'Ada', roles });

const request = (signedInUser?: SignedInUser) =>
  ({ method: 'GET', originalUrl: '/admin', session: signedInUser ? { user: signedInUser } : {} }) as AppRequest;

const response = () => {
  const res = { status: jest.fn(), render: jest.fn(), redirect: jest.fn() };
  return res as unknown as Response & typeof res;
};

describe('isMarketplaceAdmin', () => {
  it('someone_holding_the_admin_role_should_be_an_admin', () => {
    expect(isMarketplaceAdmin(user([AMP_ADMIN]))).toBe(true);
  });

  it('no_roles_claim_another_role_or_no_user_should_not_be_an_admin', () => {
    expect(isMarketplaceAdmin(user())).toBe(false);
    expect(isMarketplaceAdmin(user(['something_else']))).toBe(false);
    expect(isMarketplaceAdmin(undefined)).toBe(false);
  });
});

describe('requireMarketplaceAdmin', () => {
  it('an_admin_should_be_let_through_without_a_page_being_rendered', () => {
    const res = response();
    expect(requireMarketplaceAdmin(request(user([AMP_ADMIN])), res)).toBe(true);
    expect(res.render).not.toHaveBeenCalled();
  });

  it('a_signed_in_non_admin_should_get_the_not_found_page', () => {
    const res = response();
    expect(requireMarketplaceAdmin(request(user()), res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.render).toHaveBeenCalledWith('not-found', {});
  });

  it('a_signed_out_visitor_should_be_sent_to_sign_in', () => {
    const res = response();
    expect(requireMarketplaceAdmin(request(), res)).toBe(false);
    expect(res.redirect).toHaveBeenCalledWith('/sign-in');
  });
});

describe('adminRequestHeaders', () => {
  it('the_headers_should_carry_only_the_session_id_token_as_a_bearer_token', () => {
    const req = { session: { idToken: 'the-id-token' } } as AppRequest;
    expect(adminRequestHeaders(req)).toEqual({ Authorization: 'Bearer the-id-token' });
  });

  it('a_session_without_an_id_token_should_fail_to_build_headers', () => {
    expect(() => adminRequestHeaders(request(user([AMP_ADMIN])))).toThrow(/no ID token/);
  });
});
