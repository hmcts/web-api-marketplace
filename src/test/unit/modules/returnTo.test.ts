import { takeReturnTo } from '../../../main/modules/session';
import { mockRequest } from '../mocks/mockRequest';

describe('takeReturnTo', () => {
  test.each([
    ['/account/applications', '/account/applications'],
    ['//evil.example.com', '/account'],
    ['https://evil.example.com', '/account'],
    ['/\\evil.example.com', '/account'],
  ])('a_stored_return_to_of_%s_should_send_the_user_to_%s', (stored, expected) => {
    const req = mockRequest({}, { returnTo: stored });

    expect(takeReturnTo(req, '/account')).toBe(expected);
    expect(req.session.returnTo).toBeUndefined();
  });
});
