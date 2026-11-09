import axios from 'axios';
import config from 'config';

import { Logger } from '../modules/logging';

const logger = Logger.getLogger('api-catalogue');

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

/** An API as the catalogue lists it. The short code is the key: nothing is read by repository name. */
export interface CatalogueApi {
  shortCode: string;
  title: string;
  /** One line, for the list. The full text is description, on CatalogueApiDetail. */
  summary?: string;
  team?: string;
  domain?: string;
  platform?: string;
  /** False for an API that is listed but has no APIM product behind it. */
  subscribable?: boolean;
}

/** One API with the description and links the list leaves out. */
export interface CatalogueApiDetail extends CatalogueApi {
  catalogueName?: string;
  description?: string;
  docsUrl?: string;
  repoUrl?: string;
  gatewayPath?: string;
  portalUrl?: string;
  /** The Entra application whose roles the API defines. Absent where it has none here. */
  resourceAppId?: string;
  role?: string;
}

let cache: { apis: CatalogueApi[]; fetchedAt: number } | null = null;
const details = new Map<string, { api?: CatalogueApiDetail; fetchedAt: number }>();

/**
 * The APIs this site lists, from the marketplace backend, which reads them from API
 * Management and its own rows. Only listed APIs come back, so there is nothing to filter.
 *
 * A failed fetch returns the last good list, or an empty one, rather than throwing: the
 * pages that fill a form from this are still usable for every other answer, and an empty
 * list is visible to the user as a catalogue that says it could not be loaded.
 */
export async function getCatalogueApis(): Promise<CatalogueApi[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.apis;
  }

  const url = `${backendUrl()}/catalogue`;
  try {
    const response = await axios.get<CatalogueApi[]>(url, { timeout: FETCH_TIMEOUT_MS });
    const apis = [...(response.data ?? [])].sort((a, b) => a.title.localeCompare(b.title));

    logger.info(`Loaded ${apis.length} APIs from the catalogue at ${url}`);
    cache = { apis, fetchedAt: Date.now() };
    return apis;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Could not load the catalogue from ${url}: ${detail}`);
    return cache?.apis ?? [];
  }
}

/**
 * One API in full. Undefined for a short code the catalogue does not list, so the caller can
 * hand on to its own not found page. Anything else the backend answers is raised, because a
 * backend that is down is not the same as an API that does not exist.
 */
export async function getCatalogueApi(shortCode: string): Promise<CatalogueApiDetail | undefined> {
  const cached = details.get(shortCode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.api;
  }

  const url = `${backendUrl()}/catalogue/${encodeURIComponent(shortCode)}`;
  try {
    const response = await axios.get<CatalogueApiDetail>(url, { timeout: FETCH_TIMEOUT_MS });
    details.set(shortCode, { api: response.data, fetchedAt: Date.now() });
    return response.data;
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) {
      details.set(shortCode, { fetchedAt: Date.now() });
      return undefined;
    }
    throw new Error(`Could not read ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      cause: error,
    });
  }
}

/**
 * The catalogue, plus any API an application already has that is no longer listed. Those stay
 * on its pages so that saving the form does not revoke a subscription the consumer never saw.
 */
export function includingSubscribed(
  catalogue: CatalogueApi[],
  subscribed: { shortCode: string; apiTitle: string }[]
): CatalogueApi[] {
  const missing = subscribed
    .filter(api => !catalogue.some(listed => listed.shortCode === api.shortCode))
    .map(api => ({ shortCode: api.shortCode, title: api.apiTitle }));

  return missing.length ? [...catalogue, ...missing].sort((a, b) => a.title.localeCompare(b.title)) : catalogue;
}

/** Plain text, split at blank lines. Line breaks inside a paragraph are just wrapping. */
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Only for tests — the module-level caches otherwise leak between cases. */
export function clearCatalogueCache(): void {
  cache = null;
  details.clear();
}

function backendUrl(): string {
  return process.env.API_URL || config.get<string>('backend.url');
}
