import { expect, test } from '../fixtures';

const CORRELATION_ID = 'x-correlation-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.describe('Correlation ID', () => {
  test('a_valid_correlation_id_should_be_echoed_back', async ({ request }) => {
    const response = await request.get('/health/liveness', { headers: { 'X-Correlation-Id': 'web-functional-001' } });

    expect(response.headers()[CORRELATION_ID]).toBe('web-functional-001');
  });

  test('a_request_without_a_correlation_id_should_be_given_one', async ({ request }) => {
    const response = await request.get('/health/liveness');

    expect(response.headers()[CORRELATION_ID]).toMatch(UUID);
  });

  test('an_unsafe_correlation_id_should_be_replaced', async ({ request }) => {
    const response = await request.get('/health/liveness', { headers: { 'X-Correlation-Id': 'not safe!' } });

    expect(response.headers()[CORRELATION_ID]).toMatch(UUID);
  });
});
