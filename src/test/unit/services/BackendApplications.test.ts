import axios from 'axios';

import {
  ApplicationsUnavailableError,
  fetchApplications,
  registerApplication,
} from '../../../main/services/BackendApplications';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

const APPLICATION = {
  id: 12,
  name: 'Tracker',
  environment: 'sandbox',
  clientId: 'client-id',
  apiCredentials: [{ apiShortCode: 'api-one', publisherId: 'product-one', subscriptionKey: 'key-one' }],
};
const REQUEST = { name: 'Tracker', environment: 'sandbox', apiShortCodes: ['api-one'] };

describe('BackendApplications', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
  });

  describe('listing', () => {
    test('the_backend_list_should_be_returned_as_it_is', async () => {
      mockedGet.mockResolvedValue({ status: 200, data: [APPLICATION] });

      expect(await fetchApplications(7)).toEqual([APPLICATION]);
    });

    test('the_signed_in_user_should_be_named_in_the_header', async () => {
      mockedGet.mockResolvedValue({ status: 200, data: [] });

      await fetchApplications(7);

      const [url, options] = mockedGet.mock.calls[0];
      expect(url).toMatch(/\/applications$/);
      expect((options as { headers: Record<string, string> }).headers.requestingUserId).toBe('7');
    });

    test('an_error_status_should_throw_rather_than_answer_an_empty_list', async () => {
      mockedGet.mockResolvedValue({ status: 401, data: { error: 'Requesting user not found.' } });

      await expect(fetchApplications(7)).rejects.toBeInstanceOf(ApplicationsUnavailableError);
    });

    test('an_unreachable_backend_should_throw', async () => {
      mockedGet.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(fetchApplications(7)).rejects.toBeInstanceOf(ApplicationsUnavailableError);
    });
  });

  describe('registering', () => {
    test('the_created_application_should_be_returned_with_its_secret', async () => {
      mockedPost.mockResolvedValue({ status: 201, data: { ...APPLICATION, clientSecret: 'abc8Q~secret' } });

      const created = await registerApplication(7, REQUEST);

      expect(created.clientSecret).toBe('abc8Q~secret');
      const [url, body, options] = mockedPost.mock.calls[0];
      expect(url).toMatch(/\/applications$/);
      expect(body).toEqual(REQUEST);
      expect((options as { headers: Record<string, string> }).headers.requestingUserId).toBe('7');
    });

    test.each([
      ['an_unknown_api', 400],
      ['missing_credentials', 503],
      ['an_azure_failure', 502],
    ])('a_rejection_for_%s_should_throw', async (_reason, status) => {
      mockedPost.mockResolvedValue({ status, data: { error: 'detail for the log' } });

      await expect(registerApplication(7, REQUEST)).rejects.toBeInstanceOf(ApplicationsUnavailableError);
    });

    test('a_created_response_without_a_secret_should_throw', async () => {
      // Without the secret the user could never use the application, so it is not a success.
      mockedPost.mockResolvedValue({ status: 201, data: APPLICATION });

      await expect(registerApplication(7, REQUEST)).rejects.toBeInstanceOf(ApplicationsUnavailableError);
    });

    test('an_unreachable_backend_should_throw', async () => {
      mockedPost.mockRejectedValue(new Error('timeout of 60000ms exceeded'));

      await expect(registerApplication(7, REQUEST)).rejects.toBeInstanceOf(ApplicationsUnavailableError);
    });
  });
});
