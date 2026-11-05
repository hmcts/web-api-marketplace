import config from 'config';

import { productFor, tokenScopes } from './ApiCatalogue';
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

export interface CallInstructions {
  title: string;
  url: string;
}

export interface Instructions {
  /** The API they are shown under, folded away below its row. */
  apiName: string;
  apiTitle: string;
  token: TokenInstructions;
  /** The API's own requests, in order. Empty where this environment has no gateway or none are held. */
  calls: CallInstructions[];
  /** The {placeholders} the calls need, in order of first use: what the scenarios supply. */
  placeholders: string[];
  /** Only in an environment with a gateway for the API. */
  scenariosUrl?: string;
}

const PUBLISHER_PLACEHOLDER = '{publisher_id}';

/**
 * Which platform environment this is: sandbox, preview, aat, demo or prod. The chart sets
 * PLATFORM_ENVIRONMENT from global.environment. Read on every use, as entraConfig is, since
 * NODE_ENV is production in all of them and cannot tell them apart.
 */
function platformEnvironment(): string {
  return process.env.PLATFORM_ENVIRONMENT || config.get<string>('apiEndpoints.environment');
}

/**
 * This environment's API Management gateway, e.g. https://sps-api-mgmt.sandbox.api.hmcts.net,
 * from apiEndpoints.apimBaseUrls, or undefined where it has none yet. The gateways are written
 * without a trailing slash, so each API's path can be appended as it is.
 */
function apimBaseUrl(): string | undefined {
  return config.get<Record<string, string>>('apiEndpoints.apimBaseUrls')[platformEnvironment()] || undefined;
}

/**
 * The Entra application an API's roles belong to, which is what a consumer asks for a token on.
 * Each API has its own, so it is read from the marketplace rather than configured here.
 * apiEndpoints.publisherId is SLC's and stands in for SLC alone when the marketplace cannot be
 * reached; any other API gets a placeholder rather than another API's ID.
 */
export async function publisherId(apiName: string = SLC_API_NAME): Promise<string> {
  const scope = (await tokenScopes())[apiName];
  if (scope) {
    return scope.replace(/\/\.default$/, '');
  }
  return apiName === SLC_API_NAME ? config.get<string>('apiEndpoints.publisherId') : PUBLISHER_PLACEHOLDER;
}

/**
 * How a consumer gets a token for this application and calls each of its APIs with it, by API
 * name. Values the page knows are filled in; the secret, the token and the path values stay as
 * placeholders.
 */
export async function instructionsFor(application: Application): Promise<Record<string, Instructions>> {
  const all: Record<string, Instructions> = {};
  for (const api of application.apis) {
    all[api.apiName] = await instructionsForApi(application, api);
  }
  return all;
}

async function instructionsForApi(application: Application, api: ApiSubscription): Promise<Instructions> {
  const product = await productFor(api.apiName);
  const resourceAppId = await publisherId(api.apiName);
  const gateway = apimBaseUrl();
  const base = gateway && product?.gatewayPath ? `${gateway}/${product.gatewayPath.replace(/^\/+/, '')}` : undefined;
  const examples = base ? (product?.exampleCalls ?? []) : [];

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
    calls: examples.map(call => ({ title: call.title, url: `${base}${call.path}` })),
    placeholders: [...new Set(examples.flatMap(call => [...call.path.matchAll(/\{([^}]+)\}/g)].map(m => m[1])))],
    ...(base ? { scenariosUrl: `${base}/scenarios` } : {}),
  };
}
