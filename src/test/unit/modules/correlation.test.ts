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
    test('reuses a well-formed inbound ID', () => {
      expect(resolveCorrelationId('c0ffee12-3456-7890-abcd-ef0123456789')).toBe('c0ffee12-3456-7890-abcd-ef0123456789');
    });

    test.each([
      ['missing', undefined],
      ['empty', ''],
      ['too long', 'a'.repeat(65)],
      ['a line break that could forge a log line', 'abc\ninfo: forged'],
      ['spaces', 'abc def'],
    ])('generates a new ID when the inbound one is %s', (_, inbound) => {
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

    test('reuses the inbound ID, echoes it, and exposes it to the handler', async () => {
      const response = await request(appEchoingContext()).get('/').set(CORRELATION_ID_HEADER, 'abc-123');

      expect(response.headers['x-correlation-id']).toBe('abc-123');
      expect(response.body.correlationId).toBe('abc-123');
    });

    test('generates an ID when none is sent', async () => {
      const response = await request(appEchoingContext()).get('/');

      expect(response.headers['x-correlation-id']).toMatch(UUID);
      expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
    });

    test('keeps concurrent requests apart', async () => {
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
      ['an absolute backend URL', requestConfig('http://backend.internal:8080/applications'), true],
      ['a path against the backend baseURL', requestConfig('/applications', 'http://backend.internal:8080'), true],
      ['another host', requestConfig('https://login.microsoftonline.com/token'), false],
      ['the same host on another port', requestConfig('http://backend.internal:9090/applications'), false],
      ['an unparseable URL', requestConfig('not a url'), false],
    ])('%s -> %s', (_, config, expected) => {
      expect(isBackendRequest(config)).toBe(expected);
    });

    test('respects a path on the backend URL', () => {
      const backend = new URL('http://backend.internal:8080/api');

      expect(isBackendRequest(requestConfig('http://backend.internal:8080/api/applications'), backend)).toBe(true);
      expect(isBackendRequest(requestConfig('http://backend.internal:8080/other'), backend)).toBe(false);
    });
  });

  describe('addCorrelationHeader', () => {
    test('sets the header on backend calls made during a request', () => {
      const config = runWithCorrelationId('abc-123', () =>
        addCorrelationHeader(requestConfig('/applications', 'http://backend.internal:8080'))
      );

      expect(config.headers.get(CORRELATION_ID_HEADER)).toBe('abc-123');
    });

    test('leaves calls to other hosts alone', () => {
      const config = runWithCorrelationId('abc-123', () =>
        addCorrelationHeader(requestConfig('https://graph.microsoft.com/v1.0/me'))
      );

      expect(config.headers.has(CORRELATION_ID_HEADER)).toBe(false);
    });

    test('leaves calls outside a request alone', () => {
      const config = addCorrelationHeader(requestConfig('/applications', 'http://backend.internal:8080'));

      expect(config.headers.has(CORRELATION_ID_HEADER)).toBe(false);
    });
  });

  describe('Correlation.enableFor', () => {
    test('registers the middleware and the axios interceptor', () => {
      const use = jest.fn();
      const client = { interceptors: { request: { use } } } as unknown as AxiosInstance;
      const app = { use: jest.fn() } as unknown as express.Application;

      new Correlation(client).enableFor(app);

      expect(app.use).toHaveBeenCalledWith(correlationMiddleware);
      expect(use).toHaveBeenCalledWith(addCorrelationHeader);
    });
  });
});
