import { setAppInsightsClient } from '../../../main/modules/logging';
import { SIGN_IN_FAILURES_METRIC, recordSignInFailure } from '../../../main/services/SecurityEvents';

const add = jest.fn();
const createCounter = jest.fn(() => ({ add }));

jest.mock('@opentelemetry/api', () => ({
  metrics: { getMeter: jest.fn(() => ({ createCounter })) },
}));

describe('SecurityEvents', () => {
  const trackTrace = jest.fn();

  beforeAll(() => setAppInsightsClient({ trackTrace }));

  beforeEach(() => {
    add.mockClear();
    trackTrace.mockClear();
  });

  test('a_failed_sign_in_should_count_once_by_reason', () => {
    recordSignInFailure('token_rejected');

    expect(createCounter).toHaveBeenCalledWith(SIGN_IN_FAILURES_METRIC, expect.anything());
    expect(SIGN_IN_FAILURES_METRIC).toBe('amp.sign_in.failures');
    expect(add).toHaveBeenCalledWith(1, { reason: 'token_rejected' });
  });

  test('a_failed_sign_in_should_be_logged_as_a_queryable_security_event', () => {
    recordSignInFailure('state_mismatch');

    expect(trackTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'SIGN_IN_FAILED reason=state_mismatch',
        severity: 'Warning',
        properties: expect.objectContaining({
          event: 'SIGN_IN_FAILED',
          reason: 'state_mismatch',
          loggerName: 'security',
        }),
      })
    );
  });

  test('a_metric_that_cannot_be_recorded_should_not_throw', () => {
    add.mockImplementationOnce(() => {
      throw new Error('exporter down');
    });

    expect(() => recordSignInFailure('cancelled')).not.toThrow();
  });
});
