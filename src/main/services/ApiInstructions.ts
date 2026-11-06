import config from 'config';

import { portalUrlFor, tokenScopes } from './ApiCatalogue';
import { ApiSubscription, Application } from './Applications';

/** Scheduling and Listing Court Schedule, the API the configured fallback Publisher ID belongs to. */
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

export interface Instructions {
  /** The API they are shown under, folded away below its row. */
  apiName: string;
  apiTitle: string;
  token: TokenInstructions;
  /** The API's page in the developer portal, where it can be tried. Absent where there is none. */
  portalUrl?: string;
}

const PUBLISHER_PLACEHOLDER = '{publisher_id}';

/**
 * The Entra application an API's roles belong to, which is what a consumer asks for a token on.
 * Each API has its own, so it is read from the marketplace rather than configured here.
 * apiEndpoints.publisherId is SLC's and stands in for SLC alone when the marketplace cannot be
 * reached; any other API gets a placeholder rather than another API's ID.
 */
export async function publisherId(apiName: string): Promise<string> {
  const scope = (await tokenScopes())[apiName];
  if (scope) {
    return scope.replace(/\/\.default$/, '');
  }
  return apiName === SLC_API_NAME ? config.get<string>('apiEndpoints.publisherId') : PUBLISHER_PLACEHOLDER;
}

/**
 * How a consumer gets a token for this application for each of its APIs, by API name, and where
 * each API can be tried in the developer portal. Values the page knows are filled in; the secret stays a
 * placeholder.
 */
export async function instructionsFor(application: Application): Promise<Record<string, Instructions>> {
  const all: Record<string, Instructions> = {};
  for (const api of application.apis) {
    all[api.apiName] = await instructionsForApi(application, api);
  }
  return all;
}

async function instructionsForApi(application: Application, api: ApiSubscription): Promise<Instructions> {
  const resourceAppId = await publisherId(api.apiName);
  const portalUrl = await portalUrlFor(api.apiName);

  return {
    apiName: api.apiName,
    apiTitle: api.apiTitle,
    token: {
      url: `https://login.microsoftonline.com/${application.tenantId || '{tenant_id}'}/oauth2/v2.0/token`,
      clientId: application.clientId,
      clientSecret: '<client_secret>',
      publisherId: resourceAppId,
      scope: `${resourceAppId}/.default`,
    },
    ...(portalUrl ? { portalUrl } : {}),
  };
}
