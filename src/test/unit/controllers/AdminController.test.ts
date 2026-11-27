import AdminController from '../../../main/controllers/AdminController';
import { AMP_ADMIN } from '../../../main/services/AdminRole';
import { BackendError } from '../../../main/services/Applications';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/AdminUsers', () => ({ listAdminUsers: jest.fn(), getAdminUser: jest.fn() }));
jest.mock('../../../main/services/AdminApplications', () => ({
  listAdminApplications: jest.fn(),
  getAdminApplication: jest.fn(),
}));

const { listAdminApplications, getAdminApplication } = require('../../../main/services/AdminApplications');
const { listAdminUsers, getAdminUser } = require('../../../main/services/AdminUsers');

const GRACE_DETAIL = {
  id: 2,
  name: 'Grace Hopper',
  email: 'grace.hopper@hmcts.net',
  status: 'ACTIVE',
  createdAt: '2026-10-15T10:00:00',
  lastLoginAt: '2026-11-02T09:00:00',
  organisation: 'Example Legal Ltd',
  applications: [
    { name: 'Case Viewer', apiCount: 2, createdAt: '2026-10-29T10:00:00' },
    { name: 'Listings', apiCount: 1, createdAt: '2026-10-30T10:00:00' },
  ],
  productionRequests: [
    {
      reference: 'PCR-ABCD2345',
      applicationName: 'Case Viewer',
      status: 'SUBMITTED',
      submittedAt: '2026-11-01T10:00:00',
    },
  ],
};

const userPage = async (id: string, session: Record<string, unknown> = { user: admin, idToken: ID_TOKEN }) => {
  const req = mockRequest({}, session);
  req.params = { id };
  const res = mockResponse();
  const next = jest.fn();
  await new AdminController().user(req, res, next);
  return { res, next, data: res.data as Record<string, unknown> };
};

describe('AdminController user page', () => {
  beforeEach(() => {
    (getAdminUser as jest.Mock).mockReset();
    (getAdminUser as jest.Mock).mockResolvedValue(GRACE_DETAIL);
  });

  test('one_user_should_show_their_details_applications_and_requests', async () => {
    const { res, data } = await userPage('2');

    expect(res.view).toBe('admin/user');
    expect((getAdminUser as jest.Mock).mock.calls[0][0].token).toBe(ID_TOKEN);
    expect((getAdminUser as jest.Mock).mock.calls[0][1]).toBe(2);
    expect(data.person).toEqual({
      name: 'Grace Hopper',
      email: 'grace.hopper@hmcts.net',
      organisation: 'Example Legal Ltd',
      status: 'Active',
      joined: '15 October 2026',
      lastSignedIn: '2 November 2026',
    });
    expect((data.applications as unknown[])[0]).toEqual({
      name: 'Case Viewer',
      apis: '2 APIs',
      created: '29 October 2026',
    });
    expect(data.productionRequests).toEqual([
      { reference: 'PCR-ABCD2345', applicationName: 'Case Viewer', status: 'Submitted', submitted: '1 November 2026' },
    ]);
    expect(data.couldNotLoad).toBe(false);
  });

  test('one_api_should_read_singular', async () => {
    const { data } = await userPage('2');

    expect((data.applications as { apis: string }[])[1].apis).toBe('1 API');
  });

  test('missing_values_should_show_not_known', async () => {
    (getAdminUser as jest.Mock).mockResolvedValue({ ...GRACE_DETAIL, organisation: null, lastLoginAt: null });

    const { data } = await userPage('2');

    expect((data.person as { organisation: string }).organisation).toBe('Not known');
    expect((data.person as { lastSignedIn: string }).lastSignedIn).toBe('Not known');
  });

  test('a_status_other_than_active_should_read_in_sentence_case', async () => {
    (getAdminUser as jest.Mock).mockResolvedValue({ ...GRACE_DETAIL, status: 'SUSPENDED' });

    const { data } = await userPage('2');

    expect((data.person as { status: string }).status).toBe('Suspended');
  });

  test('a_user_with_no_name_should_be_headed_by_email', async () => {
    (getAdminUser as jest.Mock).mockResolvedValue({ ...GRACE_DETAIL, name: ' ' });

    const { data } = await userPage('2');

    expect((data.person as { name: string }).name).toBe('grace.hopper@hmcts.net');
  });

  test('an_unknown_user_should_be_handed_on_to_not_found', async () => {
    (getAdminUser as jest.Mock).mockResolvedValue(undefined);

    const { res, next } = await userPage('999');

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });

  test.each(['abc', '1abc', '1.5', '-1', '1234567890123456789'])(
    'an_id_that_is_not_a_row_id_%s_should_be_not_found_without_asking_the_backend',
    async id => {
      const { res, next } = await userPage(id);

      expect(next).toHaveBeenCalled();
      expect(res.view).toBeUndefined();
      expect(getAdminUser).not.toHaveBeenCalled();
    }
  );

  test('an_unreachable_backend_should_say_the_user_could_not_be_loaded', async () => {
    (getAdminUser as jest.Mock).mockRejectedValue(new Error('Could not reach the backend'));

    const { res, data } = await userPage('2');

    expect(res.view).toBe('admin/user');
    expect(data.couldNotLoad).toBe(true);
  });

  test('a_backend_that_no_longer_accepts_the_token_should_send_the_admin_to_sign_in_from_a_user_page', async () => {
    (getAdminUser as jest.Mock).mockRejectedValue(new BackendError('The backend answered 401', 401));

    const { res } = await userPage('2');

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });
});

const ID_TOKEN = 'header.payload.signature';
const admin = { id: 1, email: 'ada@example.com', name: 'Ada Admin', roles: [AMP_ADMIN] };

const ADA = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada.lovelace@hmcts.net',
  createdAt: '2026-10-29T10:00:00',
  lastLoginAt: '2026-11-02T09:00:00',
  applicationCount: 2,
};
const GRACE = {
  id: 2,
  name: 'Grace Hopper',
  email: 'grace.hopper@hmcts.net',
  createdAt: '2026-10-15T10:00:00',
  lastLoginAt: null,
  applicationCount: 0,
};

const usersPage = async (
  query: Record<string, string> = {},
  session: Record<string, unknown> = { user: admin, idToken: ID_TOKEN }
) => {
  const req = mockRequest({}, session);
  req.query = query;
  const res = mockResponse();
  const next = jest.fn();
  await new AdminController().users(req, res, next);
  return { res, next, data: res.data as Record<string, unknown> };
};

describe('AdminController users page', () => {
  beforeEach(() => {
    (listAdminUsers as jest.Mock).mockReset();
    (listAdminUsers as jest.Mock).mockResolvedValue([ADA, GRACE]);
  });

  test('the_users_page_should_list_what_the_backend_returns', async () => {
    const { res, data } = await usersPage();

    expect(res.view).toBe('admin/users');
    expect(data.count).toBe(2);
    expect(data.users).toEqual([
      {
        id: 1,
        name: 'Ada Lovelace',
        email: 'ada.lovelace@hmcts.net',
        joined: '29 October 2026',
        lastSignedIn: '2 November 2026',
        applications: 2,
      },
      expect.objectContaining({ id: 2, name: 'Grace Hopper', joined: '15 October 2026' }),
    ]);
    expect(data.couldNotLoad).toBe(false);
  });

  test('the_users_page_should_ask_the_backend_with_the_signed_in_admins_token', async () => {
    await usersPage({}, { user: { ...admin, oid: 'aaaaaaaa-1111-2222-3333-444444444444' }, idToken: ID_TOKEN });

    const owner = (listAdminUsers as jest.Mock).mock.calls[0][0];
    expect(owner.oid).toBe('aaaaaaaa-1111-2222-3333-444444444444');
    expect(owner.token).toBe(ID_TOKEN);
  });

  test('a_user_who_has_never_signed_in_should_show_not_known', async () => {
    const { data } = await usersPage();

    expect((data.users as { lastSignedIn: string }[])[1].lastSignedIn).toBe('Not known');
  });

  test('a_search_should_match_name_or_email_ignoring_case_and_spaces', async () => {
    const byName = await usersPage({ q: '  ADA ' });
    expect((byName.data.users as { id: number }[]).map(u => u.id)).toEqual([1]);
    expect(byName.data.q).toBe('ADA');

    const byEmail = await usersPage({ q: 'hopper@' });
    expect((byEmail.data.users as { id: number }[]).map(u => u.id)).toEqual([2]);
  });

  test('a_search_matching_nobody_should_count_zero', async () => {
    const { data } = await usersPage({ q: 'nobody' });

    expect(data.count).toBe(0);
    expect(data.users).toEqual([]);
  });

  test('a_user_with_no_name_should_be_listed_by_email', async () => {
    (listAdminUsers as jest.Mock).mockResolvedValue([{ ...ADA, name: '' }]);

    const { data } = await usersPage();

    expect((data.users as { name: string }[])[0].name).toBe('ada.lovelace@hmcts.net');
  });

  test('an_unreachable_backend_should_say_the_users_could_not_be_loaded', async () => {
    (listAdminUsers as jest.Mock).mockRejectedValue(new Error('Could not reach the backend'));

    const { res, data } = await usersPage();

    expect(res.view).toBe('admin/users');
    expect(data.couldNotLoad).toBe(true);
    expect(data.count).toBe(0);
  });

  test('a_backend_refusal_should_be_handed_on_to_not_found', async () => {
    (listAdminUsers as jest.Mock).mockResolvedValue(undefined);

    const { res, next } = await usersPage();

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });

  test('a_backend_that_no_longer_accepts_the_token_should_send_the_admin_to_sign_in', async () => {
    (listAdminUsers as jest.Mock).mockRejectedValue(new BackendError('The backend answered 401', 401));

    const { res, data } = await usersPage();

    expect(res.redirected).toBe('/sign-in');
    expect(data).toBeUndefined();
  });
});

const dashboard = async (session: Record<string, unknown> = { user: admin, idToken: ID_TOKEN }) => {
  const res = mockResponse();
  const next = jest.fn();
  await new AdminController().get(mockRequest({}, session), res, next);
  return { res, next, counts: (res.data as Record<string, unknown>)?.counts as Record<string, unknown> };
};

describe('AdminController', () => {
  beforeEach(() => {
    (listAdminUsers as jest.Mock).mockReset();
    (listAdminUsers as jest.Mock).mockResolvedValue([ADA, GRACE]);
    (listAdminApplications as jest.Mock).mockReset();
    (listAdminApplications as jest.Mock).mockResolvedValue([CASE_VIEWER, LISTINGS, CASE_VIEWER]);
  });

  test('an_admin_should_see_the_admin_page', async () => {
    const { res } = await dashboard();

    expect(res.view).toBe('admin');
  });

  test('the_users_should_be_counted_from_the_user_list', async () => {
    const { counts } = await dashboard();

    expect(counts.users).toBe(2);
  });

  test('the_applications_should_be_counted_from_the_application_list', async () => {
    const { counts } = await dashboard();

    expect(counts.applications).toBe(3);
  });

  test('the_production_requests_should_read_as_unknown_until_they_have_an_endpoint', async () => {
    const { counts } = await dashboard();

    expect(counts.productionRequests).toBe('—');
  });

  test('applications_that_cannot_be_counted_should_read_as_unknown_without_losing_the_users', async () => {
    (listAdminApplications as jest.Mock).mockRejectedValue(new BackendError('Not deployed yet', 404));

    const { res, counts } = await dashboard();

    expect(res.view).toBe('admin');
    expect(counts.users).toBe(2);
    expect(counts.applications).toBe('—');
    expect((res.data as Record<string, unknown>).couldNotLoad).toBe(false);
  });

  test('a_token_refused_while_counting_applications_should_send_the_admin_to_sign_in', async () => {
    (listAdminApplications as jest.Mock).mockRejectedValue(new BackendError('Unauthorised', 401));

    const { res } = await dashboard();

    expect(res.redirected).toBe('/sign-in');
  });

  test('an_unreachable_backend_should_say_the_figures_could_not_be_loaded', async () => {
    (listAdminUsers as jest.Mock).mockRejectedValue(new BackendError('Backend down'));

    const { res } = await dashboard();

    expect(res.view).toBe('admin');
    expect((res.data as Record<string, unknown>).couldNotLoad).toBe(true);
  });

  test('a_backend_that_no_longer_accepts_the_token_should_send_the_admin_to_sign_in', async () => {
    (listAdminUsers as jest.Mock).mockRejectedValue(new BackendError('Unauthorised', 401));

    const { res } = await dashboard();

    expect(res.redirected).toBe('/sign-in');
  });

  test('an_admin_the_backend_refuses_should_be_told_the_page_is_not_found', async () => {
    (listAdminUsers as jest.Mock).mockResolvedValue(undefined);

    const { next, res } = await dashboard();

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });
});

const CASE_VIEWER = {
  id: 10,
  name: 'Case Viewer',
  owner: { id: 2, name: 'Grace Hopper', email: 'grace.hopper@hmcts.net' },
  apiCount: 2,
  createdAt: '2026-10-29T10:00:00',
  productionRequested: true,
};
const LISTINGS = {
  id: 11,
  name: 'Listings',
  owner: { id: 1, name: ' ', email: 'ada.lovelace@hmcts.net' },
  apiCount: 1,
  createdAt: '2026-10-30T10:00:00',
  productionRequested: false,
};

const applicationsPage = async (session: Record<string, unknown> = { user: admin, idToken: ID_TOKEN }) => {
  const res = mockResponse();
  const next = jest.fn();
  await new AdminController().applications(mockRequest({}, session), res, next);
  return { res, next, data: res.data as Record<string, unknown> };
};

describe('AdminController applications page', () => {
  beforeEach(() => {
    (listAdminApplications as jest.Mock).mockReset();
    (listAdminApplications as jest.Mock).mockResolvedValue([LISTINGS, CASE_VIEWER]);
  });

  test('the_applications_page_should_list_what_the_backend_returns', async () => {
    const { res, data } = await applicationsPage();

    expect(res.view).toBe('admin/applications');
    expect((listAdminApplications as jest.Mock).mock.calls[0][0].token).toBe(ID_TOKEN);
    expect(data.count).toBe(2);
    expect(data.applications).toEqual([
      {
        id: 11,
        name: 'Listings',
        owner: { id: 1, name: 'ada.lovelace@hmcts.net', email: 'ada.lovelace@hmcts.net' },
        apis: '1 API',
        created: '30 October 2026',
        productionRequested: false,
      },
      {
        id: 10,
        name: 'Case Viewer',
        owner: { id: 2, name: 'Grace Hopper', email: 'grace.hopper@hmcts.net' },
        apis: '2 APIs',
        created: '29 October 2026',
        productionRequested: true,
      },
    ]);
    expect(data.couldNotLoad).toBe(false);
  });

  test('an_application_with_no_owner_should_have_none', async () => {
    (listAdminApplications as jest.Mock).mockResolvedValue([{ ...CASE_VIEWER, owner: null }]);

    const { data } = await applicationsPage();

    expect((data.applications as { owner: unknown }[])[0].owner).toBeUndefined();
  });

  test('an_unreachable_backend_should_say_the_applications_could_not_be_loaded', async () => {
    (listAdminApplications as jest.Mock).mockRejectedValue(new Error('Could not reach the backend'));

    const { res, data } = await applicationsPage();

    expect(res.view).toBe('admin/applications');
    expect(data.couldNotLoad).toBe(true);
    expect(data.count).toBe(0);
  });

  test('a_backend_refusal_should_be_handed_on_to_not_found', async () => {
    (listAdminApplications as jest.Mock).mockResolvedValue(undefined);

    const { res, next } = await applicationsPage();

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });

  test('a_backend_that_no_longer_accepts_the_token_should_send_the_admin_to_sign_in_from_the_applications', async () => {
    (listAdminApplications as jest.Mock).mockRejectedValue(new BackendError('The backend answered 401', 401));

    const { res } = await applicationsPage();

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });
});

const CASE_VIEWER_DETAIL = {
  id: 10,
  name: 'Case Viewer',
  clientId: '4759fa10-17be-4ff0-bee6-b632864d0fc2',
  createdAt: '2026-10-29T10:00:00',
  owner: { id: 2, name: 'Grace Hopper', email: 'grace.hopper@hmcts.net' },
  apis: ['Court Schedule'],
  productionRequest: {
    reference: 'PCR-ABCD2345',
    applicationName: 'Case Viewer',
    status: 'IN_REVIEW',
    submittedAt: '2026-11-01T10:00:00',
  },
};

const applicationPage = async (id: string, session: Record<string, unknown> = { user: admin, idToken: ID_TOKEN }) => {
  const req = mockRequest({}, session);
  req.params = { id };
  const res = mockResponse();
  const next = jest.fn();
  await new AdminController().application(req, res, next);
  return { res, next, data: res.data as Record<string, unknown> };
};

describe('AdminController application page', () => {
  beforeEach(() => {
    (getAdminApplication as jest.Mock).mockReset();
    (getAdminApplication as jest.Mock).mockResolvedValue(CASE_VIEWER_DETAIL);
  });

  test('one_application_should_show_its_details_apis_and_request', async () => {
    const { res, data } = await applicationPage('10');

    expect(res.view).toBe('admin/application');
    expect((getAdminApplication as jest.Mock).mock.calls[0][1]).toBe(10);
    expect(data.application).toEqual({
      name: 'Case Viewer',
      owner: { id: 2, name: 'Grace Hopper', email: 'grace.hopper@hmcts.net' },
      created: '29 October 2026',
      clientId: '4759fa10-17be-4ff0-bee6-b632864d0fc2',
      apis: ['Court Schedule'],
    });
    expect(data.productionRequest).toEqual({
      reference: 'PCR-ABCD2345',
      status: 'In review',
      submitted: '1 November 2026',
    });
    expect(data.couldNotLoad).toBe(false);
  });

  test('an_application_with_no_request_should_have_none', async () => {
    (getAdminApplication as jest.Mock).mockResolvedValue({ ...CASE_VIEWER_DETAIL, productionRequest: null });

    const { data } = await applicationPage('10');

    expect(data.productionRequest).toBeUndefined();
  });

  test('an_unknown_application_should_be_handed_on_to_not_found', async () => {
    (getAdminApplication as jest.Mock).mockResolvedValue(undefined);

    const { res, next } = await applicationPage('999');

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });

  test.each(['abc', '1abc', '1.5', '-1', '1234567890123456789'])(
    'an_application_id_that_is_not_a_row_id_%s_should_be_not_found_without_asking_the_backend',
    async id => {
      const { res, next } = await applicationPage(id);

      expect(next).toHaveBeenCalled();
      expect(res.view).toBeUndefined();
      expect(getAdminApplication).not.toHaveBeenCalled();
    }
  );

  test('an_unreachable_backend_should_say_the_application_could_not_be_loaded', async () => {
    (getAdminApplication as jest.Mock).mockRejectedValue(new Error('Could not reach the backend'));

    const { res, data } = await applicationPage('10');

    expect(res.view).toBe('admin/application');
    expect(data.couldNotLoad).toBe(true);
  });

  test('a_backend_that_no_longer_accepts_the_token_should_send_the_admin_to_sign_in_from_an_application', async () => {
    (getAdminApplication as jest.Mock).mockRejectedValue(new BackendError('The backend answered 401', 401));

    const { res } = await applicationPage('10');

    expect(res.redirected).toBe('/sign-in');
  });
});
