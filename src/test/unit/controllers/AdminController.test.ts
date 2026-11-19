import AdminController from '../../../main/controllers/AdminController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

const admin = { id: 1, email: 'ada@example.com', name: 'Ada Admin', role: 'ADMIN' };
const user = { id: 2, email: 'joe@example.com', name: 'Joe Bloggs', role: 'USER' };

describe('AdminController', () => {
  test('an_admin_should_see_the_admin_page', () => {
    const res = mockResponse();
    const next = jest.fn();

    new AdminController().get(mockRequest({}, { user: admin }), res, next);

    expect(res.view).toBe('admin');
    expect(next).not.toHaveBeenCalled();
  });

  test('a_user_should_be_handed_on_to_not_found', () => {
    const res = mockResponse();
    const next = jest.fn();

    new AdminController().get(mockRequest({}, { user }), res, next);

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });

  test('a_signed_out_visitor_should_be_redirected_to_sign_in', () => {
    const res = mockResponse();
    const next = jest.fn();

    new AdminController().get(mockRequest({}), res, next);

    expect(res.redirected).toBe('/sign-in');
    expect(next).not.toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });
});
