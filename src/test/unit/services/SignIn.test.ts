import axios from 'axios';

import { signIn } from '../../../main/services/SignIn';

jest.mock('axios');

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe('SignIn', () => {
  beforeEach(() => mockedPost.mockReset());

  test('a_200_should_return_the_user', async () => {
    const user = { email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'Org' };
    mockedPost.mockResolvedValue({ status: 200, data: user });

    const result = await signIn('joe@example.com', 'any');

    expect(result.ok).toBe(true);
    expect(result.user).toEqual(user);
  });

  test('a_404_for_an_unknown_email_should_be_rejected_without_detail', async () => {
    mockedPost.mockResolvedValue({ status: 404, data: { error: 'User not found.' } });

    const result = await signIn('nobody@example.com', 'any');

    // No user and no reason: the caller must not be able to tell unknown-account from
    // wrong-password, so the page cannot be used to enumerate registered addresses.
    expect(result.ok).toBe(false);
    expect(result.user).toBeUndefined();
  });

  test('a_400_should_be_rejected', async () => {
    mockedPost.mockResolvedValue({ status: 400, data: {} });

    expect((await signIn('bad', 'any')).ok).toBe(false);
  });

  test('a_network_failure_should_be_rejected_rather_than_thrown', async () => {
    mockedPost.mockRejectedValue(new Error('ECONNREFUSED'));

    expect((await signIn('joe@example.com', 'any')).ok).toBe(false);
  });

  test('the_password_should_be_sent_to_the_backend_not_logged', async () => {
    mockedPost.mockResolvedValue({ status: 200, data: {} });

    await signIn('joe@example.com', 's3cr3t');

    const [, body] = mockedPost.mock.calls[0];
    expect(body).toEqual({ email: 'joe@example.com', password: 's3cr3t' });
  });
});
