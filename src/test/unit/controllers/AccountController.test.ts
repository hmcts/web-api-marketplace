import AccountController from '../../../main/controllers/AccountController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

const content = { heading: 'Your account', signOutButton: 'Sign out' };

const user = { email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

describe('AccountController', () => {
  test('a_signed_out_visitor_should_be_redirected_to_sign_in', () => {
    const res = mockResponse();

    new AccountController().get(mockRequest({ account: content }), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });

  test('a_signed_in_user_should_see_the_account_page_with_their_details', () => {
    const res = mockResponse();

    new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(res.view).toBe('account');
    expect(res.data?.user).toEqual(user);
  });
});
