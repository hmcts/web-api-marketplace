import AccountController from '../../../main/controllers/AccountController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/Subscriptions', () => ({ getSubscriptionsFor: jest.fn() }));

const { getSubscriptionsFor } = require('../../../main/services/Subscriptions');

const content = { heading: 'Your account', signOutButton: 'Sign out' };

const user = { id: 1, email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

const subscription = {
  id: 'e6a1c0de-0000-4000-8000-000000000001',
  status: 'NEW',
  api: 'CP Crime Hearing API',
  apiShortCode: 'api-cp-crime-hearing',
  environment: 'sandbox',
  expectedVolume: 'low',
  useCase: 'Ingesting hearing data',
  requestingUserEmail: user.email,
};

describe('AccountController', () => {
  beforeEach(() => {
    (getSubscriptionsFor as jest.Mock).mockReset();
    (getSubscriptionsFor as jest.Mock).mockResolvedValue({ ok: true, subscriptions: [] });
  });

  test('a_signed_out_visitor_should_be_redirected_to_sign_in', async () => {
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
    expect(getSubscriptionsFor).not.toHaveBeenCalled();
  });

  test('a_signed_in_user_should_see_the_account_page_with_their_details', async () => {
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(res.view).toBe('account');
    expect(res.data?.user).toEqual(user);
  });

  test('the_requests_should_be_looked_up_for_the_signed_in_address_only', async () => {
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(getSubscriptionsFor).toHaveBeenCalledWith(user.email);
    expect(res.data?.subscriptions).toEqual([]);
    expect(res.data?.couldNotLoad).toBe(false);
  });

  test('submitted_requests_should_be_passed_to_the_page', async () => {
    (getSubscriptionsFor as jest.Mock).mockResolvedValue({ ok: true, subscriptions: [subscription] });
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(res.data?.subscriptions).toEqual([subscription]);
    expect(res.data?.couldNotLoad).toBe(false);
  });

  test('a_failed_lookup_should_be_flagged_rather_than_shown_as_having_none', async () => {
    // Having submitted nothing and being unable to find out are different things, and
    // only one of them is the user's own doing.
    (getSubscriptionsFor as jest.Mock).mockResolvedValue({ ok: false, subscriptions: [] });
    const res = mockResponse();

    await new AccountController().get(mockRequest({ account: content }, { user }), res);

    expect(res.data?.couldNotLoad).toBe(true);
  });
});
