import process from 'node:process';

import * as appInsights from 'applicationinsights';
import config from 'config';

import { Logger, setAppInsightsClient } from '../logging';

export class AppInsights {
  enable(): void {
    let appInsightsConnectionString: string | undefined;
    if (process.env.APP_INSIGHTS_CONNECTION_STRING) {
      appInsightsConnectionString = process.env.APP_INSIGHTS_CONNECTION_STRING;
    } else if (config.get('secrets.apim.APP_INSIGHTS_CONNECTION_STRING')) {
      appInsightsConnectionString = config.get('secrets.apim.APP_INSIGHTS_CONNECTION_STRING');
    }

    if (appInsightsConnectionString) {
      process.env.OTEL_SERVICE_NAME ||= 'apim-marketplace-web';

      const sdk = appInsights.setup(appInsightsConnectionString);
      const httpInstrumentationOptions = {
        enabled: true,
        ignoreIncomingRequestHook: (request: { url?: string }) => {
          const path = request.url?.split('?', 1)[0];
          return path === '/health/liveness' || path === '/health/readiness';
        },
      };

      appInsights.defaultClient.config.azureMonitorOpenTelemetryOptions = {
        instrumentationOptions: {
          http: httpInstrumentationOptions,
        },
      };

      sdk
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true, false)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectConsole(false, true)
        .setAutoCollectPreAggregatedMetrics(true)
        .setSendLiveMetrics(false)
        .setInternalLogging(false, true)
        .enableWebInstrumentation(false)
        .start();

      setAppInsightsClient(appInsights.defaultClient);
      Logger.getLogger('app').info('App insights activated');
    }
  }
}
