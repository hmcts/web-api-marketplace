import BackendCheckController from '../../../main/controllers/BackendCheckController';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/BackendHealth', () => ({
  backendUrl: 'http://backend:8080',
  backendPath: '/',
  checkBackendHealth: jest.fn(),
}));

const { checkBackendHealth } = require('../../../main/services/BackendHealth');

describe('BackendCheckController', () => {
  test('a_reachable_backend_should_return_200_with_the_greeting_and_url', async () => {
    checkBackendHealth.mockResolvedValue({
      ok: true,
      status: 200,
      latencyMs: 12,
      detail: 'Welcome to api-marketplace',
    });
    const res = mockResponse();

    await new BackendCheckController().get({} as never, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, latencyMs: 12, url: 'http://backend:8080/' }));
  });

  test('an_unreachable_backend_should_return_502_with_the_failure_detail', async () => {
    checkBackendHealth.mockResolvedValue({
      ok: false,
      status: null,
      latencyMs: 5000,
      detail: 'timeout of 5000ms exceeded',
    });
    const res = mockResponse();

    await new BackendCheckController().get({} as never, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, detail: 'timeout of 5000ms exceeded' }));
  });
});
