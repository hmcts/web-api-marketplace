const sdk = {
  setAutoCollectRequests: jest.fn().mockReturnThis(),
  setAutoCollectPerformance: jest.fn().mockReturnThis(),
  setAutoCollectExceptions: jest.fn().mockReturnThis(),
  setAutoCollectDependencies: jest.fn().mockReturnThis(),
  setAutoCollectConsole: jest.fn().mockReturnThis(),
  setAutoCollectPreAggregatedMetrics: jest.fn().mockReturnThis(),
  setSendLiveMetrics: jest.fn().mockReturnThis(),
  setInternalLogging: jest.fn().mockReturnThis(),
  enableWebInstrumentation: jest.fn().mockReturnThis(),
  start: jest.fn(),
};
const defaultClient = {
  config: {} as Record<string, unknown>,
  trackTrace: jest.fn(),
};
const setup = jest.fn().mockReturnValue(sdk);
const info = jest.fn();
const getConfig = jest.fn();
const setAppInsightsClient = jest.fn();

jest.mock('applicationinsights', () => ({
  defaultClient,
  setup,
}));

jest.mock('config', () => ({
  get: getConfig,
}));

jest.mock('../../../../main/modules/logging', () => ({
  Logger: {
    getLogger: jest.fn().mockReturnValue({ info }),
  },
  setAppInsightsClient,
}));

import { AppInsights } from '../../../../main/modules/appinsights';

describe('AppInsights', () => {
  const originalConnectionString = process.env.APP_INSIGHTS_CONNECTION_STRING;
  const originalServiceName = process.env.OTEL_SERVICE_NAME;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.APP_INSIGHTS_CONNECTION_STRING;
    delete process.env.OTEL_SERVICE_NAME;
    defaultClient.config = {};
    getConfig.mockReturnValue('');
  });

  afterAll(() => {
    restoreEnvironmentVariable('APP_INSIGHTS_CONNECTION_STRING', originalConnectionString);
    restoreEnvironmentVariable('OTEL_SERVICE_NAME', originalServiceName);
  });

  test('starts Application Insights with the environment connection string and service name', () => {
    process.env.APP_INSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    sdk.start.mockImplementationOnce(() => {
      expect(defaultClient.config.azureMonitorOpenTelemetryOptions).toBeDefined();
    });

    new AppInsights().enable();

    expect(process.env.OTEL_SERVICE_NAME).toBe('apim-marketplace-web');
    expect(setup).toHaveBeenCalledWith('InstrumentationKey=test');
    expect(defaultClient.config.azureMonitorOpenTelemetryOptions).toEqual({
      instrumentationOptions: {
        http: {
          enabled: true,
          ignoreIncomingRequestHook: expect.any(Function),
        },
      },
    });
    expect(sdk.setAutoCollectRequests).toHaveBeenCalledWith(true);
    expect(sdk.setAutoCollectPerformance).toHaveBeenCalledWith(true, false);
    expect(sdk.setAutoCollectConsole).toHaveBeenCalledWith(false, true);
    expect(sdk.setSendLiveMetrics).toHaveBeenCalledWith(false);
    expect(sdk.start).toHaveBeenCalled();
    expect(setAppInsightsClient).toHaveBeenCalledWith(defaultClient);
    expect(info).toHaveBeenCalledWith('App insights activated');

    const options = defaultClient.config.azureMonitorOpenTelemetryOptions as {
      instrumentationOptions: { http: { ignoreIncomingRequestHook: (request: { url?: string }) => boolean } };
    };
    const { ignoreIncomingRequestHook } = options.instrumentationOptions.http;
    expect(ignoreIncomingRequestHook({ url: '/health/liveness' })).toBe(true);
    expect(ignoreIncomingRequestHook({ url: '/health/readiness?probe=true' })).toBe(true);
    expect(ignoreIncomingRequestHook({ url: '/health' })).toBe(false);
    expect(ignoreIncomingRequestHook({ url: '/courts' })).toBe(false);
  });

  test('uses the configured Key Vault connection string as a fallback', () => {
    getConfig.mockReturnValue('InstrumentationKey=key-vault');

    new AppInsights().enable();

    expect(setup).toHaveBeenCalledWith('InstrumentationKey=key-vault');
    expect(sdk.start).toHaveBeenCalled();
  });

  test('does not start Application Insights without a connection string', () => {
    new AppInsights().enable();

    expect(setup).not.toHaveBeenCalled();
    expect(sdk.start).not.toHaveBeenCalled();
    expect(setAppInsightsClient).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
