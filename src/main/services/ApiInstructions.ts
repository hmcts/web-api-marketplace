import config from 'config';

import { getCatalogueApi, tokenScopes } from './ApiCatalogue';
import { ApiSubscription, Application } from './Applications';

/** Scheduling and Listing Court Schedule, the API the configured fallback Publisher ID belongs to. */
export const SLC_SHORT_CODE = 'slc';

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
  shortCode: string;
  apiTitle: string;
  token: TokenInstructions;
  /** Where the API's REST endpoints are documented, for the calls to make with the token. */
  docsUrl?: string;
}

const PUBLISHER_PLACEHOLDER = '{publisher_id}';

/**
 * The Entra application an API's roles belong to, which is what a consumer asks for a token on.
 * Each API has its own, so it is read from the marketplace rather than configured here.
 * apiEndpoints.publisherId is SLC's and stands in for SLC alone when the marketplace cannot be
 * reached; any other API gets a placeholder rather than another API's ID.
 */
export async function publisherId(shortCode: string = SLC_SHORT_CODE): Promise<string> {
  const scope = (await tokenScopes())[shortCode];
  if (scope) {
    return scope.replace(/\/\.default$/, '');
  }
  return shortCode === SLC_SHORT_CODE ? config.get<string>('apiEndpoints.publisherId') : PUBLISHER_PLACEHOLDER;
}

/**
 * How a consumer gets a token for this application for each of its APIs, by short code, and
 * where each API's endpoints are documented. Values the page knows are filled in; the secret
 * stays a placeholder.
 */
export async function instructionsFor(application: Application): Promise<Record<string, Instructions>> {
  const all: Record<string, Instructions> = {};
  for (const api of application.apis) {
    all[api.shortCode] = await instructionsForApi(application, api);
  }
  return all;
}

async function instructionsForApi(application: Application, api: ApiSubscription): Promise<Instructions> {
  const resourceAppId = await publisherId(api.shortCode);

  return {
    shortCode: api.shortCode,
    apiTitle: api.apiTitle,
    token: {
      url: `https://login.microsoftonline.com/${application.tenantId || '{tenant_id}'}/oauth2/v2.0/token`,
      clientId: application.clientId,
      clientSecret: '<client_secret>',
      publisherId: resourceAppId,
      scope: `${resourceAppId}/.default`,
    },
    docsUrl: (await getCatalogueApi(api.shortCode))?.docsUrl,
  };
}
