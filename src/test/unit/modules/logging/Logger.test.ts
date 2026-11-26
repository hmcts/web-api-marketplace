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

  test('an_error_should_reach_the_console_and_application_insights_with_its_details_flattened', () => {
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

  test('a_telemetry_failure_should_not_stop_the_console_log', () => {
    trackTrace.mockImplementationOnce(() => {
      throw new Error('telemetry unavailable');
    });

    expect(() => Logger.getLogger('app').warn('Application warning')).not.toThrow();
    expect(delegateLogger.warn).toHaveBeenCalledWith('Application warning');
  });

  test('an_event_should_send_its_properties_to_application_insights_without_losing_the_logger_name', () => {
    Logger.getLogger('security').event('warn', 'SIGN_IN_FAILED reason=cancelled', {
      event: 'SIGN_IN_FAILED',
      reason: 'cancelled',
      loggerName: 'not-this',
    });

    expect(delegateLogger.warn).toHaveBeenCalledWith('SIGN_IN_FAILED reason=cancelled');
    expect(trackTrace).toHaveBeenCalledWith({
      message: 'SIGN_IN_FAILED reason=cancelled',
      severity: 'Warning',
      properties: { event: 'SIGN_IN_FAILED', reason: 'cancelled', loggerName: 'security' },
    });
  });

  describe('during a request', () => {
    test('a_log_during_a_request_should_carry_the_correlation_id_to_the_console_and_application_insights', () => {
      runWithCorrelationId('abc-123', () => Logger.getLogger('app').info('Application created'));

      expect(delegateLogger.info).toHaveBeenCalledWith('Application created', { correlationId: 'abc-123' });
      expect(trackTrace).toHaveBeenCalledWith({
        message: 'Application created',
        severity: 'Information',
        properties: { loggerName: 'app', correlationId: 'abc-123' },
      });
    });

    test('existing_metadata_should_gain_the_correlation_id_without_being_changed_in_place', () => {
      const details = { status: 409 };

      runWithCorrelationId('abc-123', () => Logger.getLogger('app').warn('APIM rejected the key', details));

      expect(delegateLogger.warn).toHaveBeenCalledWith('APIM rejected the key', {
        status: 409,
        correlationId: 'abc-123',
      });
      expect(details).toEqual({ status: 409 });
    });

    test('an_error_argument_should_be_followed_by_the_correlation_id_not_merged_with_it', () => {
      const error = new Error('boom');

      runWithCorrelationId('abc-123', () => Logger.getLogger('app').error('Failed', error));

      expect(delegateLogger.error).toHaveBeenCalledWith('Failed', error, { correlationId: 'abc-123' });
    });
  });

  test('a_log_outside_a_request_should_carry_no_correlation_id', () => {
    Logger.getLogger('app').info('Startup complete');

    expect(delegateLogger.info).toHaveBeenCalledWith('Startup complete');
    expect(trackTrace).toHaveBeenCalledWith(expect.objectContaining({ properties: { loggerName: 'app' } }));
  });
});
