import SignOutController from '../../../main/controllers/SignOutController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

const user = { id: 1, email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

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
