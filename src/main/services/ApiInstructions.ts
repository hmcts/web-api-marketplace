import { getCatalogueApi } from './ApiCatalogue';
import { ApiSubscription, Application } from './Applications';

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
  /** The API's page in the developer portal, where it can be tried. Absent where there is none. */
  portalUrl?: string;
}

/** Shown where the catalogue holds no resource app for an API, rather than another API's ID. */
const PUBLISHER_PLACEHOLDER = '{publisher_id}';

/**
 * How a consumer gets a token for this application for each of its APIs, by short code, and
 * where each API can be tried in the developer portal. Values the page knows are filled in;
 * the secret stays a placeholder.
 */
export async function instructionsFor(application: Application): Promise<Record<string, Instructions>> {
  const all: Record<string, Instructions> = {};
  for (const api of application.apis) {
    all[api.shortCode] = await instructionsForApi(application, api);
  }
  return all;
}

async function instructionsForApi(application: Application, api: ApiSubscription): Promise<Instructions> {
  const catalogue = await getCatalogueApi(api.shortCode);
  // The Entra application the API's roles belong to, which is what a consumer asks a token on.
  const resourceAppId = catalogue?.resourceAppId || PUBLISHER_PLACEHOLDER;

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
    ...(catalogue?.portalUrl ? { portalUrl: catalogue.portalUrl } : {}),
  };
}
