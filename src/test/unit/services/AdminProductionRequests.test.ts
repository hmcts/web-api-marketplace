import axios from 'axios';

import { getAdminProductionRequest, listAdminProductionRequests } from '../../../main/services/AdminProductionRequests';
import { Owner } from '../../../main/services/Applications';

jest.mock('axios');

const mockedRequest = axios.request as jest.MockedFunction<typeof axios.request>;

const ADMIN: Owner = { oid: 'aaaaaaaa-1111-2222-3333-444444444444', userReference: 'user001' };

const rejection = (status: number) => Object.assign(new Error(`status ${status}`), { response: { status } });

describe('AdminProductionRequests', () => {
  beforeEach(() => mockedRequest.mockReset());

  test('listing_should_get_admin_production_requests', async () => {
    mockedRequest.mockResolvedValue({ data: [{ reference: 'PCR-7K2MHQ4D' }] });

    await expect(listAdminProductionRequests(ADMIN)).resolves.toEqual([{ reference: 'PCR-7K2MHQ4D' }]);

    const request = mockedRequest.mock.calls[0][0];
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/admin/production-requests');
  });

  test('one_request_should_be_read_by_reference', async () => {
    mockedRequest.mockResolvedValue({ data: { reference: 'PCR-7K2MHQ4D', apis: [] } });

    await expect(getAdminProductionRequest(ADMIN, 'PCR-7K2MHQ4D')).resolves.toMatchObject({
      reference: 'PCR-7K2MHQ4D',
    });
    expect(mockedRequest.mock.calls[0][0].url).toBe('/admin/production-requests/PCR-7K2MHQ4D');
  });

  test('one_request_should_be_undefined_when_the_backend_does_not_know_it', async () => {
    mockedRequest.mockRejectedValue(rejection(404));

    await expect(getAdminProductionRequest(ADMIN, 'PCR-NOTHERE1')).resolves.toBeUndefined();
  });

  test('a_refusal_should_be_undefined_for_both_calls', async () => {
    mockedRequest.mockRejectedValue(rejection(403));

    await expect(listAdminProductionRequests(ADMIN)).resolves.toBeUndefined();
    await expect(getAdminProductionRequest(ADMIN, 'PCR-7K2MHQ4D')).resolves.toBeUndefined();
  });

  test('any_other_failure_should_be_thrown', async () => {
    mockedRequest.mockRejectedValue(rejection(500));

    await expect(listAdminProductionRequests(ADMIN)).rejects.toThrow();
    await expect(getAdminProductionRequest(ADMIN, 'PCR-7K2MHQ4D')).rejects.toThrow();
  });
});
