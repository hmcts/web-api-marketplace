import axios from 'axios';

import { deleteRequest, getRequestsFor, isRequestType } from '../../../main/services/Requests';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedDelete = axios.delete as jest.MockedFunction<typeof axios.delete>;

const subscription = { reference: 'a', type: 'SUBSCRIPTION', submittedAt: '2026-09-01T09:00:00', status: 'NEW' };
const publication = { reference: 'b', type: 'PUBLISH', submittedAt: '2026-09-02T09:00:00', status: 'NEW' };

describe('Requests', () => {
  beforeEach(() => mockedGet.mockReset());

  test('both_kinds_should_be_returned_as_the_backend_ordered_them', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: [publication, subscription] });

    const result = await getRequestsFor(1);

    expect(result.ok).toBe(true);
    expect(result.requests).toEqual([publication, subscription]);
  });

  test('the_signed_in_user_should_be_named_in_the_header_not_a_query', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: [] });

    await getRequestsFor(7);

    const [, options] = mockedGet.mock.calls[0];
    expect((options as { headers: Record<string, string> }).headers.requestingUserId).toBe('7');
  });

  test('an_error_status_should_report_failure_rather_than_an_empty_list', async () => {
    mockedGet.mockResolvedValue({ status: 500, data: '' });

    expect(await getRequestsFor(1)).toEqual({ ok: false, requests: [] });
  });

  test('an_unreachable_backend_should_report_failure_rather_than_throwing', async () => {
    mockedGet.mockRejectedValue(new Error('connect ECONNREFUSED'));

    expect(await getRequestsFor(1)).toEqual({ ok: false, requests: [] });
  });

  test('a_body_that_is_not_a_list_should_be_treated_as_none', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: { error: 'nope' } });

    expect((await getRequestsFor(1)).requests).toEqual([]);
  });

  describe('deleting one', () => {
    beforeEach(() => mockedDelete.mockReset());

    test('a_subscription_should_be_deleted_from_the_subscriptions_collection', async () => {
      mockedDelete.mockResolvedValue({ status: 204, data: '' });

      expect(await deleteRequest(1, 'SUBSCRIPTION', 'AR-2026-IPCOC1')).toBe(true);

      const [url] = mockedDelete.mock.calls[0];
      expect(url).toContain('/subscriptions/AR-2026-IPCOC1');
    });

    test('a_publication_should_be_deleted_from_the_publish_requests_collection', async () => {
      mockedDelete.mockResolvedValue({ status: 204, data: '' });

      expect(await deleteRequest(1, 'PUBLISH', 'PR-2026-E9PDKA')).toBe(true);

      const [url] = mockedDelete.mock.calls[0];
      expect(url).toContain('/publish-requests/PR-2026-E9PDKA');
    });

    test('the_signed_in_user_should_be_named_in_the_header_so_the_backend_can_check_ownership', async () => {
      mockedDelete.mockResolvedValue({ status: 204, data: '' });

      await deleteRequest(7, 'SUBSCRIPTION', 'AR-2026-IPCOC1');

      const [, options] = mockedDelete.mock.calls[0];
      expect((options as { headers: Record<string, string> }).headers.requestingUserId).toBe('7');
    });

    test('a_reference_should_be_escaped_rather_than_pasted_into_the_path', async () => {
      mockedDelete.mockResolvedValue({ status: 204, data: '' });

      await deleteRequest(1, 'SUBSCRIPTION', 'AR/2026 X');

      const [url] = mockedDelete.mock.calls[0];
      expect(url).toContain('/subscriptions/AR%2F2026%20X');
    });

    test('a_request_that_is_already_gone_should_count_as_deleted', async () => {
      // What a second click, or a resubmitted form, produces. The request is not there
      // any more, which is what was asked for.
      mockedDelete.mockResolvedValue({ status: 404, data: '' });

      expect(await deleteRequest(1, 'SUBSCRIPTION', 'AR-2026-IPCOC1')).toBe(true);
    });

    test('an_error_status_should_report_failure', async () => {
      mockedDelete.mockResolvedValue({ status: 500, data: '' });

      expect(await deleteRequest(1, 'SUBSCRIPTION', 'AR-2026-IPCOC1')).toBe(false);
    });

    test('an_unreachable_backend_should_report_failure_rather_than_throwing', async () => {
      mockedDelete.mockRejectedValue(new Error('connect ECONNREFUSED'));

      expect(await deleteRequest(1, 'SUBSCRIPTION', 'AR-2026-IPCOC1')).toBe(false);
    });
  });

  describe('recognising a type', () => {
    test('the_two_known_types_should_be_recognised', () => {
      expect(isRequestType('SUBSCRIPTION')).toBe(true);
      expect(isRequestType('PUBLISH')).toBe(true);
    });

    test('anything_else_should_be_rejected_rather_than_used_as_a_path', () => {
      expect(isRequestType('SUPPORT')).toBe(false);
      expect(isRequestType('')).toBe(false);
      expect(isRequestType(undefined)).toBe(false);
      expect(isRequestType('constructor')).toBe(false);
      expect(isRequestType('toString')).toBe(false);
    });
  });
});
