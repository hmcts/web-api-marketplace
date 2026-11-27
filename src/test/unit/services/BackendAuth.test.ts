import { authHeaders } from '../../../main/services/BackendAuth';

describe('authHeaders', () => {
  test('a_session_with_a_token_should_send_only_the_token', () => {
    expect(authHeaders('the-id-token')).toEqual({ Authorization: 'Bearer the-id-token' });
  });

  test('a_session_without_a_token_should_send_nothing', () => {
    expect(authHeaders()).toEqual({});
  });
});
