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
});
