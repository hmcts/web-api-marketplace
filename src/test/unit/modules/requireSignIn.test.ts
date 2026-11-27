import { Response } from 'express';

import { requireSignIn } from '../../../main/modules/session';
import { LOCAL_USER } from '../helpers/consumer';
import { mockRequest } from '../mocks/mockRequest';

const response = () => ({ redirect: jest.fn() }) as unknown as Response & { redirect: jest.Mock };

describe('requireSignIn', () => {
  test('a_session_with_a_user_and_a_token_should_be_let_through', () => {
    const res = response();

    expect(requireSignIn(mockRequest({}, { user: LOCAL_USER as never }), res)).toBe(true);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('a_session_whose_token_is_gone_should_sign_in_again', () => {
    const req = mockRequest({}, { user: LOCAL_USER as never, idToken: undefined });
    const res = response();

    expect(requireSignIn(req, res)).toBe(false);
    expect(req.session.user).toBeUndefined();
    expect(res.redirect).toHaveBeenCalledWith('/sign-in');
  });
});
