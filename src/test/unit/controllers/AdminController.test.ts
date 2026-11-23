import AdminController from '../../../main/controllers/AdminController';
import { AMP_ADMIN } from '../../../main/services/AdminRole';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

const admin = { id: 1, email: 'ada@example.com', name: 'Ada Admin', roles: [AMP_ADMIN] };
const user = { id: 2, email: 'joe@example.com', name: 'Joe Bloggs' };

describe('AdminController', () => {
  test('an_admin_should_see_the_admin_page', () => {
    const res = mockResponse();

    new AdminController().get(mockRequest({}, { user: admin }), res);

    expect(res.view).toBe('admin');
  });

  test('a_user_should_be_told_the_page_is_not_found', () => {
    const res = mockResponse();

    new AdminController().get(mockRequest({}, { user }), res);

    expect(res.statusCode).toBe(404);
    expect(res.view).toBe('not-found');
  });

  test('a_signed_out_visitor_should_be_redirected_to_sign_in', () => {
    const res = mockResponse();

    new AdminController().get(mockRequest({}), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });
});
