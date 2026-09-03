import axios from 'axios';

import { getSubscriptionsFor } from '../../../main/services/Subscriptions';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const mine = { id: 'a', requestingUserEmail: 'joe@example.com', api: 'CP Crime Hearing API' };
const theirs = { id: 'b', requestingUserEmail: 'someone.else@example.com', api: 'Other API' };

describe('Subscriptions', () => {
  beforeEach(() => mockedGet.mockReset());

  test('only_the_signed_in_users_requests_should_be_returned', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: [mine, theirs] });

    const result = await getSubscriptionsFor('joe@example.com');

    expect(result.ok).toBe(true);
    expect(result.subscriptions).toEqual([mine]);
  });

  test('the_address_should_be_matched_regardless_of_case_or_spacing', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: [mine] });

    expect((await getSubscriptionsFor('  JOE@Example.com ')).subscriptions).toEqual([mine]);
  });

  test('a_row_without_an_address_should_never_be_treated_as_the_users_own', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: [{ id: 'c' }, mine] });

    expect((await getSubscriptionsFor('joe@example.com')).subscriptions).toEqual([mine]);
  });

  test('an_empty_signed_in_address_should_match_nothing_rather_than_everything', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: [{ id: 'c' }, mine, theirs] });

    // '' === '' would otherwise match every row that has no address on it.
    expect(await getSubscriptionsFor('')).toEqual({ ok: false, subscriptions: [] });
    expect(mockedGet).not.toHaveBeenCalled();
  });

  test('an_error_status_should_report_failure_rather_than_an_empty_list', async () => {
    mockedGet.mockResolvedValue({ status: 500, data: '' });

    expect(await getSubscriptionsFor('joe@example.com')).toEqual({ ok: false, subscriptions: [] });
  });

  test('an_unreachable_backend_should_report_failure_rather_than_throwing', async () => {
    mockedGet.mockRejectedValue(new Error('connect ECONNREFUSED'));

    expect(await getSubscriptionsFor('joe@example.com')).toEqual({ ok: false, subscriptions: [] });
  });

  test('a_body_that_is_not_a_list_should_be_treated_as_none', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: { error: 'nope' } });

    expect((await getSubscriptionsFor('joe@example.com')).subscriptions).toEqual([]);
  });
});
