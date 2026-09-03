import AccountController from '../../../main/controllers/AccountController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/Requests', () => ({ getRequestsFor: jest.fn() }));

const { getRequestsFor } = require('../../../main/services/Requests');

const content = { heading: 'Your account', signOutButton: 'Sign out' };

const user = { id: 1, email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

const request = {
  reference: 'e6a1c0de-0000-4000-8000-000000000001',
  type: 'SUBSCRIPTION',
  submittedAt: '2026-09-03T11:02:51',
  status: 'NEW',
};

describe('AccountController', () => {
  beforeEach(() => {
    (getRequestsFor as jest.Mock).mockReset();
    (getRequestsFor as jest.Mock).mockResolvedValue({ ok: true, requests: [] });
  });

  test('a_signed_out_visitor_should_be_redirected_to_sign_in', async () => {
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
    expect(getRequestsFor).not.toHaveBeenCalled();
  });

  test('a_signed_in_user_should_see_the_account_page_with_their_details', async () => {
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(res.view).toBe('account');
    expect(res.data?.user).toEqual(user);
  });

  test('the_requests_should_be_looked_up_for_the_signed_in_user_only', async () => {
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(getRequestsFor).toHaveBeenCalledWith(user.id);
    expect(res.data?.myRequests).toEqual([]);
    expect(res.data?.couldNotLoad).toBe(false);
  });

  test('submitted_requests_should_be_passed_to_the_page', async () => {
    (getRequestsFor as jest.Mock).mockResolvedValue({ ok: true, requests: [request] });
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect((res.data?.myRequests as unknown as { reference: string }[])[0].reference).toBe(request.reference);
    expect(res.data?.couldNotLoad).toBe(false);
  });

  test('the_submission_date_should_be_readable_rather_than_a_timestamp', async () => {
    (getRequestsFor as jest.Mock).mockResolvedValue({ ok: true, requests: [request] });
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect((res.data?.myRequests as unknown as { submittedOn: string }[])[0].submittedOn).toBe('3 September 2026');
  });

  test('an_unreadable_date_should_be_passed_through_rather_than_shown_as_invalid', async () => {
    (getRequestsFor as jest.Mock).mockResolvedValue({
      ok: true,
      requests: [{ ...request, submittedAt: 'not a date' }],
    });
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect((res.data?.myRequests as unknown as { submittedOn: string }[])[0].submittedOn).toBe('not a date');
  });

  test('a_failed_lookup_should_be_flagged_rather_than_shown_as_having_none', async () => {
    // Having submitted nothing and being unable to find out are different things, and
    // only one of them is the user's own doing.
    (getRequestsFor as jest.Mock).mockResolvedValue({ ok: false, requests: [] });
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(res.data?.couldNotLoad).toBe(true);
  });
});
