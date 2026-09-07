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

  test('a_network_failure_should_be_reported_as_unavailable_rather_than_thrown', async () => {
    mockedPost.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await signIn('joe@example.com', 'any');

    // Nothing answered, so nothing judged the credentials. Calling this a refusal sends
    // the user off to reset a password that was never wrong.
    expect(result.ok).toBe(false);
    expect(result.unavailable).toBe(true);
  });

  test('a_timeout_should_be_reported_as_unavailable', async () => {
    mockedPost.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

    expect((await signIn('joe@example.com', 'any')).unavailable).toBe(true);
  });

  test('a_backend_error_should_be_reported_as_unavailable_not_as_a_refusal', async () => {
    mockedPost.mockResolvedValue({ status: 500, data: '' });

    const result = await signIn('joe@example.com', 'any');

    expect(result.ok).toBe(false);
    expect(result.unavailable).toBe(true);
  });

  test('a_bad_gateway_should_be_reported_as_unavailable', async () => {
    mockedPost.mockResolvedValue({ status: 502, data: '' });

    expect((await signIn('joe@example.com', 'any')).unavailable).toBe(true);
  });

  test('a_refusal_should_not_be_confused_with_an_outage', async () => {
    mockedPost.mockResolvedValue({ status: 404, data: { error: 'User not found.' } });

    expect((await signIn('nobody@example.com', 'any')).unavailable).toBeUndefined();
  });

  test('the_password_should_be_sent_to_the_backend_not_logged', async () => {
    mockedPost.mockResolvedValue({ status: 200, data: {} });

    await signIn('joe@example.com', 's3cr3t');

    const [, body] = mockedPost.mock.calls[0];
    expect(body).toEqual({ email: 'joe@example.com', password: 's3cr3t' });
  });
});
