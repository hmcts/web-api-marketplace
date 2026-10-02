import axios from 'axios';
import config from 'config';

import { Logger } from '../modules/logging';

const logger = Logger.getLogger('api-catalogue');

export const catalogueUrl: string = process.env.CATALOGUE_URL || config.get('catalogue.url');

const CACHE_TTL_MS = 10 * 60 * 1000;

export interface CatalogueApi {
  name: string;
  title: string;
  description?: string;
  team?: string;
}

interface CatalogueFeed {
  apis?: { name?: string; title?: string; description?: string; team?: string }[];
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

/**
 * Where an API's own documentation and source live. The feed carries neither, but every
 * API in it is published from an hmcts repository of the same name by the
 * publish-api-docs workflow, which is what puts it in the feed at all.
 */
export function linksFor(name: string): { docsUrl: string; repoUrl: string } {
  return {
    docsUrl: `https://hmcts.github.io/${encodeURIComponent(name)}/`,
    repoUrl: `https://github.com/hmcts/${encodeURIComponent(name)}`,
  };
}

/**
 * The catalogue feed carries no domain or platform, so both are read from the repository
 * name, as the GitHub Pages catalogue does. They are for browsing only — a name that
 * matches no rule is "Other" rather than a wrong guess. Ordered: the first match wins.
 */
const DOMAIN_RULES: [RegExp, string][] = [
  [/^api-cp-ai-/, 'AI'],
  [/^api-cp-refdata-/, 'Reference data'],
  [/prosecution-case|results-pcr|caseadmin|defendant/, 'Case administration'],
  [/scheduling|listing|court-list/, 'Scheduling and listing'],
  [/hearing/, 'Hearings'],
];

/** Every API in the feed is api-cp-* today. Add a rule when another platform appears. */
const PLATFORM_RULES: [RegExp, string][] = [[/^api-cp-/, 'Common Platform']];

export function domainOf(name: string): string {
  return DOMAIN_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? 'Other';
}

export function platformOf(name: string): string {
  return PLATFORM_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? 'Other';
}

/** Only for tests — the module-level cache otherwise leaks between cases. */
export function clearCatalogueCache(): void {
  cache = null;
}

function toApis(feed: CatalogueFeed): CatalogueApi[] {
  return (feed?.apis ?? [])
    .filter(api => !!api?.name)
    .map(api => ({
      name: api.name as string,
      title: api.title || (api.name as string),
      ...(api.description ? { description: api.description } : {}),
      ...(api.team ? { team: api.team } : {}),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
