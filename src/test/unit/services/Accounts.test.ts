import { MemoryStore, useDataStore } from '../../../main/modules/store';
import {
  authenticate,
  findAccount,
  register,
  resetPassword,
  startPasswordReset,
  validatePassword,
  verifyEmail,
} from '../../../main/services/Accounts';

const registration = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'Ada@Example.com',
  orgName: 'Analytical Engines Ltd',
  role: 'consumer' as const,
  password: 'correct horse battery',
};

describe('Accounts', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('a_new_account_should_be_unverified_and_never_hold_the_password_itself', async () => {
    const result = await register(registration);
    const account = await findAccount('ada@example.com');

    expect(result.created).toBe(true);
    expect(account?.verified).toBe(false);
    expect(JSON.stringify(account)).not.toContain(registration.password);
  });

  test('registering_the_same_address_again_should_not_create_a_second_account', async () => {
    await register(registration);

    expect(await register({ ...registration, email: 'ada@example.com', password: 'another password!' })).toEqual({
      created: false,
    });
  });

  test('an_unverified_account_should_not_sign_in_but_only_say_so_given_the_right_password', async () => {
    await register(registration);

    expect(await authenticate('ada@example.com', 'wrong password')).toEqual({ status: 'rejected' });
    expect(await authenticate('ada@example.com', registration.password)).toEqual({ status: 'unverified' });
  });

  test('a_verified_account_should_sign_in_as_a_local_user', async () => {
    const result = await register(registration);
    await verifyEmail((result as { token: string }).token);

    const signedIn = await authenticate('ADA@example.com', registration.password);

    expect(signedIn.status).toBe('ok');
    expect(signedIn.status === 'ok' && signedIn.user).toMatchObject({ email: 'ada@example.com', local: true });
  });

  test('an_address_registered_elsewhere_should_be_unknown_here', async () => {
    expect(await authenticate('backend-user@example.com', 'anything')).toEqual({ status: 'unknown' });
  });

  test('a_reset_should_replace_the_password_and_work_once', async () => {
    await register(registration);
    const token = (await startPasswordReset('ada@example.com')) as string;

    expect(await resetPassword(token, 'a brand new password')).toBe(true);
    expect(await resetPassword(token, 'yet another password')).toBe(false);
    expect((await authenticate('ada@example.com', 'a brand new password')).status).toBe('ok');
    expect((await authenticate('ada@example.com', registration.password)).status).toBe('rejected');
  });

  test('no_reset_should_start_for_an_address_without_an_account', async () => {
    expect(await startPasswordReset('nobody@example.com')).toBeUndefined();
  });

  test('passwords_should_be_long_enough_and_confirmed', () => {
    expect(validatePassword('', '')).toBe('Enter a password');
    expect(validatePassword('short', 'short')).toContain('at least 12 characters');
    expect(validatePassword('long enough password', 'different')).toContain('do not match');
    expect(validatePassword('long enough password', 'long enough password')).toBeUndefined();
  });
});
