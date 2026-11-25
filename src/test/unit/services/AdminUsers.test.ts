import axios from 'axios';

import { getAdminUser, listAdminUsers } from '../../../main/services/AdminUsers';
import { Owner } from '../../../main/services/Applications';

jest.mock('axios');

const mockedRequest = axios.request as jest.MockedFunction<typeof axios.request>;

const ADMIN: Owner = { oid: 'aaaaaaaa-1111-2222-3333-444444444444', userReference: 'user001' };

const USER = {
  id: 2,
  name: 'Grace Hopper',
  email: 'grace.hopper@hmcts.net',
  createdAt: '2026-10-29T10:00:00',
  lastLoginAt: '2026-11-02T10:00:00',
  applicationCount: 1,
};

const rejection = (status: number) => Object.assign(new Error(`status ${status}`), { response: { status } });

describe('AdminUsers', () => {
  beforeEach(() => mockedRequest.mockReset());

  test('listing_should_get_admin_users_as_the_caller', async () => {
    mockedRequest.mockResolvedValue({ data: [USER] });

    await expect(listAdminUsers(ADMIN)).resolves.toEqual([USER]);

    const request = mockedRequest.mock.calls[0][0];
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/admin/users');
    expect(request.headers).toMatchObject({ requestingUserId: ADMIN.oid });
  });

  test('one_user_should_be_read_by_id', async () => {
    mockedRequest.mockResolvedValue({ data: { ...USER, applications: [], productionRequests: [] } });

    await expect(getAdminUser(ADMIN, 2)).resolves.toMatchObject({ id: 2, applications: [] });
    expect(mockedRequest.mock.calls[0][0].url).toBe('/admin/users/2');
  });

  test('one_user_should_be_undefined_when_the_backend_does_not_know_them', async () => {
    mockedRequest.mockRejectedValue(rejection(404));

    await expect(getAdminUser(ADMIN, 999)).resolves.toBeUndefined();
  });

  test('a_refusal_should_be_undefined_for_both_calls', async () => {
    mockedRequest.mockRejectedValue(rejection(403));

    await expect(listAdminUsers(ADMIN)).resolves.toBeUndefined();
    await expect(getAdminUser(ADMIN, 2)).resolves.toBeUndefined();
  });

  test('any_other_failure_should_be_thrown', async () => {
    mockedRequest.mockRejectedValue(rejection(500));

    await expect(getAdminUser(ADMIN, 2)).rejects.toThrow();
    await expect(listAdminUsers(ADMIN)).rejects.toThrow();
  });
});
