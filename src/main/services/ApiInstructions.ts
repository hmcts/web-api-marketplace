import config from 'config';

import { tokenScopes } from './ApiCatalogue';
import { Application } from './Applications';

/** Scheduling and Listing Court Schedule, the API the call and scenario instructions are for. */
export const SLC_API_NAME = 'api-cp-crime-schedulingandlisting-courtschedule';

export interface TokenInstructions {
  url: string;
  clientId: string;
  /** Always a placeholder: the backend gives the full secret only once, when it is created. */
  clientSecret: string;
  publisherId: string;
  /** The Publisher ID followed by /.default. */
  scope: string;
}

export interface SlcInstructions {
  courtScheduleUrl: string;
  scenariosUrl: string;
}

export interface Instructions {
  /** The API they are shown under, folded away below its row. */
  apiName: string;
  token: TokenInstructions;
  /** Only for an application with SLC, in an environment that has an SLC address. */
  slc?: SlcInstructions;
}

/** Where SLC sits on the API Management gateway. */
const SLC_PATH = '/amp/try/slc';

/**
 * This environment's API Management gateway, e.g. https://sps-api-mgmt.sandbox.api.hmcts.net,
 * or undefined where it has none yet. Each environment sets APIM_BASE_URL in cnp-flux-config;
 * apiEndpoints.apimBaseUrl is the fallback, empty everywhere but local development. Read on
 * every use, as entraConfig is.
 */
function apimBaseUrl(): string | undefined {
  const url = process.env.APIM_BASE_URL || config.get<string>('apiEndpoints.apimBaseUrl');
  return url ? url.replace(/\/+$/, '') : undefined;
}

/** Where SLC is called in this environment, or undefined where it has no gateway yet. */
export function slcBaseUrl(): string | undefined {
  const gateway = apimBaseUrl();
  return gateway ? `${gateway}${SLC_PATH}` : undefined;
}

/**
 * The Entra application an API's roles belong to, which is what a consumer asks for a token on.
 * Each API has its own, so it is read from the marketplace rather than configured here;
 * apiEndpoints.publisherId stands in only when the marketplace cannot be reached.
 */
export async function publisherId(apiName: string = SLC_API_NAME): Promise<string> {
  const scope = (await tokenScopes())[apiName];
  return scope ? scope.replace(/\/\.default$/, '') : config.get<string>('apiEndpoints.publisherId');
}

/**
 * How a consumer gets a token for this application and calls SLC with it. Values the page
 * knows are filled in; the secret, the token and the case URN stay as placeholders.
 */
export async function instructionsFor(application: Application): Promise<Instructions> {
  const slc = application.apis.find(api => api.apiName === SLC_API_NAME);
  const tenant = application.tenantId || '{tenant_id}';
  const base = slc ? slcBaseUrl() : undefined;
  const resourceAppId = await publisherId(SLC_API_NAME);

  return {
    apiName: SLC_API_NAME,
    token: {
      url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      clientId: application.clientId,
      clientSecret: '<client_secret>',
      publisherId: resourceAppId,
      scope: `${resourceAppId}/.default`,
    },
    ...(base
      ? {
          slc: {
            courtScheduleUrl: `${base}/case/{case_urn}/courtschedule`,
            scenariosUrl: `${base}/scenarios`,
          },
        }
      : {}),
  };
}
