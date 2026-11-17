const delegateLogger = {
  silly: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const trackTrace = jest.fn();

jest.mock('@hmcts/nodejs-logging', () => ({
  Logger: {
    getLogger: jest.fn().mockReturnValue(delegateLogger),
  },
}));

import { runWithCorrelationId } from '../../../../main/modules/correlation/context';
import { Logger, setAppInsightsClient } from '../../../../main/modules/logging';

describe('Logger', () => {
  beforeAll(() => {
    setAppInsightsClient({ trackTrace });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('writes errors to the console logger and Application Insights', () => {
    const logger = Logger.getLogger('app');
    const details = {
      name: 'ZodError',
      message: 'Data API response failed schema validation',
      issueCount: 1,
      issues: [
        {
          code: 'invalid_type',
          path: 'courtAccessibilityOptions',
          message: 'Invalid input: expected string, received null',
        },
      ],
    };

    logger.error('Error fetching court details:', details);

    expect(delegateLogger.error).toHaveBeenCalledWith('Error fetching court details:', details);
    expect(trackTrace).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Error fetching court details: name=ZodError, message=Data API response failed schema validation'
      ),
      severity: 'Error',
      properties: {
        loggerName: 'app',
      },
    });
    expect(trackTrace.mock.calls[0][0].message).toContain(
      'issues=[code=invalid_type, path=courtAccessibilityOptions, message=Invalid input: expected string, received null]'
    );
  });

  test('does not interrupt console logging if telemetry throws', () => {
    trackTrace.mockImplementationOnce(() => {
      throw new Error('telemetry unavailable');
    });

    expect(() => Logger.getLogger('app').warn('Application warning')).not.toThrow();
    expect(delegateLogger.warn).toHaveBeenCalledWith('Application warning');
  });

  describe('during a request', () => {
    test('adds the correlation ID as metadata and to Application Insights', () => {
      runWithCorrelationId('abc-123', () => Logger.getLogger('app').info('Application created'));

      expect(delegateLogger.info).toHaveBeenCalledWith('Application created', { correlationId: 'abc-123' });
      expect(trackTrace).toHaveBeenCalledWith({
        message: 'Application created',
        severity: 'Information',
        properties: { loggerName: 'app', correlationId: 'abc-123' },
      });
    });

    test('merges into existing metadata rather than adding a second object', () => {
      const details = { status: 409 };

      runWithCorrelationId('abc-123', () => Logger.getLogger('app').warn('APIM rejected the key', details));

      expect(delegateLogger.warn).toHaveBeenCalledWith('APIM rejected the key', {
        status: 409,
        correlationId: 'abc-123',
      });
      expect(details).toEqual({ status: 409 });
    });

    test('appends after an error rather than merging into it', () => {
      const error = new Error('boom');

      runWithCorrelationId('abc-123', () => Logger.getLogger('app').error('Failed', error));

      expect(delegateLogger.error).toHaveBeenCalledWith('Failed', error, { correlationId: 'abc-123' });
    });
  });

  test('leaves the arguments untouched outside a request', () => {
    Logger.getLogger('app').info('Startup complete');

    expect(delegateLogger.info).toHaveBeenCalledWith('Startup complete');
    expect(trackTrace).toHaveBeenCalledWith(expect.objectContaining({ properties: { loggerName: 'app' } }));
  });
});
