import { AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import express from 'express';
import request from 'supertest';

import {
  CORRELATION_ID_HEADER,
  Correlation,
  addCorrelationHeader,
  correlationMiddleware,
  getCorrelationId,
  isBackendRequest,
  resolveCorrelationId,
} from '../../../main/modules/correlation';
import { runWithCorrelationId } from '../../../main/modules/correlation/context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function requestConfig(url: string, baseURL?: string): InternalAxiosRequestConfig {
  return { url, baseURL, headers: new AxiosHeaders() };
}

describe('correlation', () => {
  const originalApiUrl = process.env.API_URL;

  beforeEach(() => {
    process.env.API_URL = 'http://backend.internal:8080';
  });

  afterAll(() => {
    process.env.API_URL = originalApiUrl;
  });

  describe('resolveCorrelationId', () => {
    test('a_well_formed_inbound_id_should_be_reused', () => {
      expect(resolveCorrelationId('c0ffee12-3456-7890-abcd-ef0123456789')).toBe('c0ffee12-3456-7890-abcd-ef0123456789');
    });

    test.each([
      ['is missing', undefined],
      ['is empty', ''],
      ['is too long', 'a'.repeat(65)],
      ['contains a line break that could forge a log line', 'abc\ninfo: forged'],
      ['contains a space', 'abc def'],
    ])('an_inbound_id_should_be_replaced_with_a_new_uuid_when_it_%s', (_, inbound) => {
      expect(resolveCorrelationId(inbound)).toMatch(UUID);
    });
  });

  describe('correlationMiddleware', () => {
    function appEchoingContext() {
      const app = express();
      app.use(correlationMiddleware);
      app.get('/', async (req, res) => {
        await Promise.resolve();
        res.json({ correlationId: getCorrelationId() });
      });
      return app;
    }

    test('an_inbound_id_should_be_echoed_in_the_response_and_seen_by_the_handler', async () => {
      const response = await request(appEchoingContext()).get('/').set(CORRELATION_ID_HEADER, 'abc-123');

      expect(response.headers['x-correlation-id']).toBe('abc-123');
      expect(response.body.correlationId).toBe('abc-123');
    });

    test('a_request_without_an_id_should_get_a_new_uuid_in_the_response_and_the_handler', async () => {
      const response = await request(appEchoingContext()).get('/');

      expect(response.headers['x-correlation-id']).toMatch(UUID);
      expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
    });

    test('concurrent_requests_should_each_see_only_their_own_id', async () => {
      const app = appEchoingContext();
      const [first, second] = await Promise.all([
        request(app).get('/').set(CORRELATION_ID_HEADER, 'first'),
        request(app).get('/').set(CORRELATION_ID_HEADER, 'second'),
      ]);

      expect(first.body.correlationId).toBe('first');
      expect(second.body.correlationId).toBe('second');
    });
  });

  describe('isBackendRequest', () => {
    test.each([
      [
        'an_absolute_backend_url_should_count_as_a_backend_call',
        requestConfig('http://backend.internal:8080/applications'),
        true,
      ],
      [
        'a_path_against_the_backend_base_url_should_count_as_a_backend_call',
        requestConfig('/applications', 'http://backend.internal:8080'),
        true,
      ],
      [
        'another_host_should_not_count_as_a_backend_call',
        requestConfig('https://login.microsoftonline.com/token'),
        false,
      ],
      [
        'the_same_host_on_another_port_should_not_count_as_a_backend_call',
        requestConfig('http://backend.internal:9090/applications'),
        false,
      ],
      ['an_unparseable_url_should_not_count_as_a_backend_call', requestConfig('not a url'), false],
    ])('%s', (_, config, expected) => {
      expect(isBackendRequest(config)).toBe(expected);
    });

    test('only_urls_under_the_backend_path_should_count_as_backend_calls', () => {
      const backend = new URL('http://backend.internal:8080/api');

      expect(isBackendRequest(requestConfig('http://backend.internal:8080/api/applications'), backend)).toBe(true);
      expect(isBackendRequest(requestConfig('http://backend.internal:8080/other'), backend)).toBe(false);
    });
  });

  describe('addCorrelationHeader', () => {
    test('a_backend_call_during_a_request_should_carry_the_correlation_id', () => {
      const config = runWithCorrelationId('abc-123', () =>
        addCorrelationHeader(requestConfig('/applications', 'http://backend.internal:8080'))
      );

      expect(config.headers.get(CORRELATION_ID_HEADER)).toBe('abc-123');
    });

    test('a_call_to_another_host_should_not_carry_the_correlation_id', () => {
      const config = runWithCorrelationId('abc-123', () =>
        addCorrelationHeader(requestConfig('https://graph.microsoft.com/v1.0/me'))
      );

      expect(config.headers.has(CORRELATION_ID_HEADER)).toBe(false);
    });

    test('a_backend_call_outside_a_request_should_not_carry_a_correlation_id', () => {
      const config = addCorrelationHeader(requestConfig('/applications', 'http://backend.internal:8080'));

      expect(config.headers.has(CORRELATION_ID_HEADER)).toBe(false);
    });
  });

  describe('Correlation.enableFor', () => {
    test('enabling_correlation_should_register_the_middleware_and_the_axios_interceptor', () => {
      const use = jest.fn();
      const client = { interceptors: { request: { use } } } as unknown as AxiosInstance;
      const app = { use: jest.fn() } as unknown as express.Application;

      new Correlation(client).enableFor(app);

      expect(app.use).toHaveBeenCalledWith(correlationMiddleware);
      expect(use).toHaveBeenCalledWith(addCorrelationHeader);
    });
  });
});
