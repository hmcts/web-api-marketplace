import axios from 'axios';

import { getRequestsFor } from '../../../main/services/Requests';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

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
});
