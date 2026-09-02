import axios from 'axios';
import config from 'config';

import { Logger } from '../modules/logging';

const logger = Logger.getLogger('api-catalogue');

export const catalogueUrl: string = process.env.CATALOGUE_URL || config.get('catalogue.url');

const CACHE_TTL_MS = 10 * 60 * 1000;

export interface CatalogueApi {
  name: string;
  title: string;
}

interface CatalogueFeed {
  apis?: { name?: string; title?: string }[];
}

let cache: { apis: CatalogueApi[]; fetchedAt: number } | null = null;

/**
 * The published API catalogue, used to fill the "Which API do you need access to?" list.
 *
 * The prototype fetches this feed from the browser. We fetch it here instead, because the
 * CSP connect-src only permits this origin — and doing it server-side also means the list
 * is present with JavaScript unavailable.
 *
 * A failed fetch returns an empty list rather than throwing: the form is still usable for
 * every other answer, and an empty list is visible to the user as a select with nothing to
 * choose, which validation then rejects. Results are cached so a page refresh does not hit
 * the feed again.
 */
export async function getCatalogueApis(): Promise<CatalogueApi[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.apis;
  }

  try {
    const response = await axios.get<CatalogueFeed>(catalogueUrl, { timeout: 5000 });
    const apis = toApis(response.data);

    logger.info(`Loaded ${apis.length} APIs from the catalogue at ${catalogueUrl}`);
    cache = { apis, fetchedAt: Date.now() };
    return apis;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Could not load the catalogue from ${catalogueUrl}: ${detail}`);
    return cache?.apis ?? [];
  }
}

/** Only for tests — the module-level cache otherwise leaks between cases. */
export function clearCatalogueCache(): void {
  cache = null;
}

function toApis(feed: CatalogueFeed): CatalogueApi[] {
  return (feed?.apis ?? [])
    .filter(api => !!api?.name)
    .map(api => ({ name: api.name as string, title: api.title || (api.name as string) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
