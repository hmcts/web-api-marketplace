import axios from 'axios';

import { checkBackendHealth } from '../../../main/services/BackendHealth';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

describe('BackendHealth', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  test('a_2xx_response_should_report_connected', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: 'API Marketplace' });

    const result = await checkBackendHealth();

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.detail).toBe('API Marketplace');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('a_204_response_should_report_connected_with_an_empty_body_note', async () => {
    mockedGet.mockResolvedValue({ status: 204, data: '' });

    const result = await checkBackendHealth();

    expect(result.ok).toBe(true);
    expect(result.detail).toBe('Empty response');
  });

  test('a_long_response_body_should_be_truncated', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: 'x'.repeat(200) });

    const result = await checkBackendHealth();

    expect(result.detail).toHaveLength(121);
    expect(result.detail.endsWith('…')).toBe(true);
  });

  test('a_non_string_response_body_should_be_serialised', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: { service: 'marketplace' } });

    const result = await checkBackendHealth();

    expect(result.detail).toBe('{"service":"marketplace"}');
  });

  test('a_non_2xx_response_should_report_not_connected_with_the_status', async () => {
    mockedGet.mockResolvedValue({ status: 503, data: 'unavailable' });

    const result = await checkBackendHealth();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.detail).toBe('Unexpected response: 503');
  });

  test('a_connection_failure_should_report_not_connected_with_the_error', async () => {
    mockedGet.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8080'));

    const result = await checkBackendHealth();

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.detail).toBe('connect ECONNREFUSED 127.0.0.1:8080');
  });

  test('a_non_error_rejection_should_report_an_unknown_error', async () => {
    mockedGet.mockRejectedValue('something odd');

    const result = await checkBackendHealth();

    expect(result.ok).toBe(false);
    expect(result.detail).toBe('Unknown error');
  });

  test('the_request_should_use_a_timeout_and_accept_any_status', async () => {
    mockedGet.mockResolvedValue({ status: 200, data: 'ok' });

    await checkBackendHealth();

    const [, options] = mockedGet.mock.calls[0];
    expect(options?.timeout).toBe(5000);
    expect(options?.validateStatus?.(503)).toBe(true);

    // The body is passed through untransformed so a plain-text greeting survives intact.
    const transform = (options?.transformResponse as ((data: string) => string)[])[0];
    expect(transform('raw body')).toBe('raw body');
  });
});
