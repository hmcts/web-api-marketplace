import axios from 'axios';

import { getAdminApplication, listAdminApplications } from '../../../main/services/AdminApplications';
import { Owner } from '../../../main/services/Applications';

jest.mock('axios');

const mockedRequest = axios.request as jest.MockedFunction<typeof axios.request>;

const ADMIN: Owner = { oid: 'aaaaaaaa-1111-2222-3333-444444444444', userReference: 'user001' };

const rejection = (status: number) => Object.assign(new Error(`status ${status}`), { response: { status } });

describe('AdminApplications', () => {
  beforeEach(() => mockedRequest.mockReset());

  test('listing_should_get_admin_applications', async () => {
    mockedRequest.mockResolvedValue({ data: [{ id: 10 }] });

    await expect(listAdminApplications(ADMIN)).resolves.toEqual([{ id: 10 }]);

    const request = mockedRequest.mock.calls[0][0];
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/admin/applications');
  });

  test('one_application_should_be_read_by_id', async () => {
    mockedRequest.mockResolvedValue({ data: { id: 10, apis: [] } });

    await expect(getAdminApplication(ADMIN, 10)).resolves.toMatchObject({ id: 10 });
    expect(mockedRequest.mock.calls[0][0].url).toBe('/admin/applications/10');
  });

  test('one_application_should_be_undefined_when_the_backend_does_not_know_it', async () => {
    mockedRequest.mockRejectedValue(rejection(404));

    await expect(getAdminApplication(ADMIN, 999)).resolves.toBeUndefined();
  });

  test('a_refusal_should_be_undefined_for_both_calls', async () => {
    mockedRequest.mockRejectedValue(rejection(403));

    await expect(listAdminApplications(ADMIN)).resolves.toBeUndefined();
    await expect(getAdminApplication(ADMIN, 10)).resolves.toBeUndefined();
  });

  test('any_other_failure_should_be_thrown', async () => {
    mockedRequest.mockRejectedValue(rejection(500));

    await expect(listAdminApplications(ADMIN)).rejects.toThrow();
    await expect(getAdminApplication(ADMIN, 10)).rejects.toThrow();
  });
});
