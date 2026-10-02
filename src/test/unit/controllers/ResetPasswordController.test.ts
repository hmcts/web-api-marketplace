import ResetPasswordController from '../../../main/controllers/ResetPasswordController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { register, startPasswordReset } from '../../../main/services/Accounts';
import { anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

const NEW_PASSWORD = 'a brand new password';

describe('ResetPasswordController', () => {
  let token: string;

  beforeEach(async () => {
    useDataStore(new MemoryStore());
    await register({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      orgName: 'AE',
      role: 'consumer',
      password: 'correct horse battery',
    });
    token = (await startPasswordReset('ada@example.com')) as string;
  });

  test('a_valid_link_should_show_the_form', async () => {
    const res = mockResponse();

    await new ResetPasswordController().get(anonymous({ query: { token } }), res);

    expect(res.view).toBe('password/reset');
    expect(res.data).toMatchObject({ token, errors: [] });
  });

  test('an_invalid_link_should_say_it_has_expired', async () => {
    const res = mockResponse();

    await new ResetPasswordController().get(anonymous({ query: {} }), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('password/link-expired');
  });

  test('posting_with_an_invalid_token_should_say_the_link_has_expired', async () => {
    const res = mockResponse();

    await new ResetPasswordController().post(
      anonymous({ body: { token: 'nonsense', password: NEW_PASSWORD, 'password-confirm': NEW_PASSWORD } }),
      res
    );

    expect(res.view).toBe('password/link-expired');
  });

  test.each([
    [{ password: 'short', 'password-confirm': 'short' }, 'password'],
    [{ password: NEW_PASSWORD, 'password-confirm': 'something else' }, 'password-confirm'],
  ])('a_bad_password_%j_should_be_reported_against_%s', async (passwords, name) => {
    const res = mockResponse();

    await new ResetPasswordController().post(anonymous({ body: { token, ...passwords } }), res);

    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.data?.errorFor as object)).toEqual([name]);
  });

  test('a_good_password_should_be_saved', async () => {
    const res = mockResponse();

    await new ResetPasswordController().post(
      anonymous({ body: { token, password: NEW_PASSWORD, 'password-confirm': NEW_PASSWORD } }),
      res
    );

    expect(res.view).toBe('password/changed');
  });
});
