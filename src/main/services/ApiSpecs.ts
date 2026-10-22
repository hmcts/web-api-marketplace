import axios from 'axios';
import { parse } from 'yaml';

import { Logger } from '../modules/logging';

import { linksFor } from './ApiCatalogue';

const logger = Logger.getLogger('api-specs');

/** Where the publish-api-docs workflow puts an API's spec on its documentation site. */
const SPEC_FILE = 'openapi-spec.yml';

const CACHE_TTL_MS = 10 * 60 * 1000;
/** A failure is remembered for a short while, so a down docs site is not asked on every visit. */
const FAILURE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const MAX_SPEC_BYTES = 512 * 1024;
const MAX_DESCRIPTION_LENGTH = 5000;

const cache = new Map<string, { description?: string; expiresAt: number }>();

/**
 * The description in an API's own OpenAPI spec (info.description), as published on its
 * documentation site. The catalogue feed carries only a short summary; this is the full
 * text the API's team wrote, so the page matches the documentation site.
 *
 * Undefined whenever it cannot be had — the docs site is down or slow, the file is missing,
 * is not YAML, or has no usable description — so the caller can fall back to the feed's
 * summary rather than show an error. Cached for ten minutes, and a failure for one.
 */
export async function getSpecDescription(name: string): Promise<string | undefined> {
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.description;
  }

  const url = `${linksFor(name).docsUrl}${SPEC_FILE}`;
  try {
    const response = await axios.get<string>(url, {
      timeout: FETCH_TIMEOUT_MS,
      responseType: 'text',
      transformResponse: data => data,
      maxContentLength: MAX_SPEC_BYTES,
      maxRedirects: 2,
    });
    const description = descriptionOf(parse(response.data, { schema: 'core' }));

    if (!description) {
      logger.warn(`No usable info.description in ${url}`);
    }
    cache.set(name, { description, expiresAt: Date.now() + (description ? CACHE_TTL_MS : FAILURE_TTL_MS) });
    return description;
  } catch (error) {
    logger.warn(`Could not read the spec at ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    cache.set(name, { expiresAt: Date.now() + FAILURE_TTL_MS });
    return undefined;
  }
}

/** Plain text, split at blank lines. Line breaks inside a paragraph are just wrapping. */
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Only for tests — the module-level cache otherwise leaks between cases. */
export function clearSpecCache(): void {
  cache.clear();
}

function descriptionOf(spec: unknown): string | undefined {
  const description = (spec as { info?: { description?: unknown } } | null)?.info?.description;

  if (typeof description !== 'string') {
    return undefined;
  }
  const trimmed = description.trim();
  return trimmed && trimmed.length <= MAX_DESCRIPTION_LENGTH ? trimmed : undefined;
}
