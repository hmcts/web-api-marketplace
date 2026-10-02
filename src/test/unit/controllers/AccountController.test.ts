import { SessionData } from 'express-session';

import AccountController from '../../../main/controllers/AccountController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/Requests', () => ({
  getRequestsFor: jest.fn(),
  deleteRequest: jest.fn(),
  isRequestType: (value: unknown) => value === 'SUBSCRIPTION' || value === 'PUBLISH',
}));

const { getRequestsFor, deleteRequest } = require('../../../main/services/Requests');

const content = { heading: 'Your account', signOutButton: 'Sign out' };

const user = { id: 1, email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

const request = {
  reference: 'AR-2026-IPCOC1',
  type: 'SUBSCRIPTION',
  submittedAt: '2026-09-03T11:02:51',
  status: 'NEW',
};

describe('AccountController', () => {
  beforeEach(() => {
    (getRequestsFor as jest.Mock).mockReset();
    (getRequestsFor as jest.Mock).mockResolvedValue({ ok: true, requests: [] });
    (deleteRequest as jest.Mock).mockReset();
    (deleteRequest as jest.Mock).mockResolvedValue(true);
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

  describe('deleting a request', () => {
    const deleting = (body: Record<string, unknown>, session: Partial<SessionData> = { user }) => {
      const req = mockRequest({ account: content }, session);
      req.body = body;
      return req;
    };

    test('a_signed_out_visitor_should_be_redirected_to_sign_in_rather_than_deleting', async () => {
      const res = mockResponse();

      await new AccountController().remove(deleting({ reference: request.reference, type: 'SUBSCRIPTION' }, {}), res);

      expect(res.redirected).toBe('/sign-in');
      expect(deleteRequest).not.toHaveBeenCalled();
    });

    test('deleting_should_use_the_signed_in_user_and_not_an_id_from_the_form', async () => {
      const res = mockResponse();

      await new AccountController().remove(
        deleting({ reference: request.reference, type: 'SUBSCRIPTION', userId: '99' }),
        res
      );

      expect(deleteRequest).toHaveBeenCalledWith(user.id, 'SUBSCRIPTION', request.reference);
      expect(res.redirected).toBe('/account');
    });

    test('deleting_a_publication_request_should_pass_its_own_type_through', async () => {
      const res = mockResponse();

      await new AccountController().remove(deleting({ reference: 'PR-2026-E9PDKA', type: 'PUBLISH' }), res);

      expect(deleteRequest).toHaveBeenCalledWith(user.id, 'PUBLISH', 'PR-2026-E9PDKA');
    });

    test('a_successful_delete_should_be_announced_once_on_the_page_that_follows', async () => {
      const req = deleting({ reference: request.reference, type: 'SUBSCRIPTION' });
      const res = mockResponse();

      await new AccountController().remove(req, res);
      expect(req.session.requestNotice).toBe('deleted');

      const next = mockResponse();
      await new AccountController().get(req, next);

      expect(next.data?.deleted).toBe(true);
      // Cleared on the way out, so a refresh does not keep announcing it.
      expect(req.session.requestNotice).toBeUndefined();
    });

    test('a_failed_delete_should_say_so_rather_than_claiming_it_worked', async () => {
      (deleteRequest as jest.Mock).mockResolvedValue(false);
      const req = deleting({ reference: request.reference, type: 'SUBSCRIPTION' });
      const res = mockResponse();

      await new AccountController().remove(req, res);

      const next = mockResponse();
      await new AccountController().get(req, next);

      expect(next.data?.deleteFailed).toBe(true);
      expect(next.data?.deleted).toBe(false);
    });

    test('a_missing_reference_should_not_reach_the_backend', async () => {
      const res = mockResponse();

      await new AccountController().remove(deleting({ type: 'SUBSCRIPTION' }), res);

      expect(deleteRequest).not.toHaveBeenCalled();
      expect(res.redirected).toBe('/account');
    });

    test('an_unknown_type_should_not_reach_the_backend', async () => {
      const res = mockResponse();

      await new AccountController().remove(deleting({ reference: request.reference, type: 'SUPPORT' }), res);

      expect(deleteRequest).not.toHaveBeenCalled();
    });
  });

  describe('requests held by this service', () => {
    const { MemoryStore, useDataStore } = require('../../../main/modules/store');
    const { addLocalRequest, listLocalRequests } = require('../../../main/services/LocalRequests');

    beforeEach(() => useDataStore(new MemoryStore()));

    test('they_should_be_listed_with_the_backends_newest_first_and_production_ones_linked', async () => {
      (getRequestsFor as jest.Mock).mockResolvedValue({ ok: true, requests: [request] });
      const production = await addLocalRequest(user.email, 'PRODUCTION', []);
      const res = mockResponse();

      await new AccountController().get(mockRequest({ account: content }, { user: user as never }), res);

      const listed = res.data?.myRequests as { reference: string; href?: string; status: string }[];
      expect(listed.map(item => item.reference)).toEqual([production.reference, request.reference]);
      expect(listed[0]).toMatchObject({
        href: `/account/production-credentials/${production.reference}`,
        status: 'Submitted',
      });
    });

    test('an_account_registered_here_should_not_ask_the_backend_for_its_requests', async () => {
      const res = mockResponse();

      await new AccountController().get(
        mockRequest({ account: content }, { user: { ...user, local: true } as never }),
        res
      );

      expect(getRequestsFor).not.toHaveBeenCalled();
      expect(res.data?.couldNotLoad).toBe(false);
    });

    test('deleting_one_should_remove_it_here_without_asking_the_backend', async () => {
      const held = await addLocalRequest(user.email, 'NEW_API', []);
      const req = mockRequest({ account: content }, { user: user as never });
      req.body = { reference: held.reference, type: 'NEW_API' };

      await new AccountController().remove(req, mockResponse());

      expect(req.session.requestNotice).toBe('deleted');
      expect(deleteRequest).not.toHaveBeenCalled();
      expect(await listLocalRequests(user.email)).toEqual([]);
    });

    test('an_account_registered_here_should_never_delete_through_the_backend', async () => {
      const req = mockRequest({ account: content }, { user: { ...user, local: true } as never });
      req.body = { reference: 'AR-2026-IPCOC1', type: 'SUBSCRIPTION' };

      await new AccountController().remove(req, mockResponse());

      expect(req.session.requestNotice).toBe('deleteFailed');
      expect(deleteRequest).not.toHaveBeenCalled();
    });
  });
});
