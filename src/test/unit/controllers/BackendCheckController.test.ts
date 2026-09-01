import { Response } from 'express';

import BackendCheckController from '../../../main/controllers/BackendCheckController';

jest.mock('../../../main/services/BackendHealth', () => ({
  backendUrl: 'http://backend:8080',
  backendPath: '/',
  checkBackendHealth: jest.fn(),
}));

const { checkBackendHealth } = require('../../../main/services/BackendHealth');

function mockResponse(): Response & { statusCode?: number; body?: unknown } {
  const res: Record<string, unknown> = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

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
