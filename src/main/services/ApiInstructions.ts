import config from 'config';

import { Application } from './Applications';

/** Scheduling and Listing Court Schedule, the API the call and scenario instructions are for. */
export const SLC_API_NAME = 'api-cp-crime-schedulingandlisting-courtschedule';

export interface TokenInstructions {
  url: string;
  clientId: string;
  /** Always a placeholder: the backend gives the full secret only once, when it is created. */
  clientSecret: string;
  /** The scope the example request uses: a Publisher ID followed by /.default. */
  scope: string;
  publishers: { apiTitle: string; publisherId: string }[];
}

export interface SlcInstructions {
  courtScheduleUrl: string;
  scenariosUrl: string;
}

export interface Instructions {
  token: TokenInstructions;
  /** Only for an application with SLC, in an environment that has an SLC address. */
  slc?: SlcInstructions;
}

/**
 * Which platform environment this is: sandbox, aat, demo or prod. Read on every use, as
 * entraConfig is, since NODE_ENV is production in all of them and cannot tell them apart.
 */
function platformEnvironment(): string {
  return process.env.PLATFORM_ENVIRONMENT || config.get<string>('apiEndpoints.environment');
}

/** Where SLC is called in this environment, or undefined where it has no address yet. */
export function slcBaseUrl(): string | undefined {
  const urls = config.get<Record<string, string>>('apiEndpoints.slcBaseUrls');
  return urls[platformEnvironment()] || undefined;
}

const scopeOf = (publisherId: string) => `${publisherId}/.default`;

/**
 * How a consumer gets a token for this application and calls SLC with it. Values the page
 * knows are filled in; the secret, the token and the case URN stay as placeholders.
 */
export function instructionsFor(application: Application): Instructions {
  const publishers = application.apis.map(api => ({ apiTitle: api.apiTitle, publisherId: api.publisherId }));
  const slc = application.apis.find(api => api.apiName === SLC_API_NAME);
  const example = slc ?? application.apis[0];
  const tenant = application.tenantId || '<tenant>';
  const base = slc ? slcBaseUrl() : undefined;

  return {
    token: {
      url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      clientId: application.clientId,
      clientSecret: '<client_secret>',
      scope: example ? scopeOf(example.publisherId) : scopeOf('<publisher_id>'),
      publishers,
    },
    ...(base
      ? {
          slc: {
            courtScheduleUrl: `${base}/amp/slc/case/<case_urn>/courtschedule`,
            scenariosUrl: `${base}/amp/slc/scenarios`,
          },
        }
      : {}),
  };
}
