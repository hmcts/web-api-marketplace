import { GET, route } from 'awilix-express';
import { NextFunction, Request, Response } from 'express';

import {
  CatalogueApi,
  domainOf,
  getCatalogueApis,
  linksFor,
  listedApiNames,
  offeredApis,
  platformOf,
} from '../services/ApiCatalogue';
import { getSpecDescription, paragraphsOf } from '../services/ApiSpecs';

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/**
 * The API catalogue, migrated from the GitHub Pages site.
 *
 * The prototype fetched the feed in the browser and filtered it with JavaScript. Here the
 * feed is fetched on the server — the CSP's connect-src only permits this origin — and the
 * search is an ordinary GET form, so the catalogue works with JavaScript unavailable and a
 * search can be bookmarked or shared.
 */
@route('/api-catalogue')
export default class ApiCatalogueController {
  @GET()
  public async list(req: Request, res: Response): Promise<void> {
    const apis = await listedApis();
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const results = (query ? apis.filter(api => matches(api, query)) : apis).map(withTags);
    const groups = query ? [] : byLetter(results);

    res.render('api-catalogue/index', {
      query,
      results,
      // Browsing, not searching: the list under a heading per letter, and a row of all 26
      // letters above it. Every letter is shown so the row does not reflow as APIs are
      // added, but only letters with APIs under them are links.
      groups,
      letters: ALPHABET.map(letter => ({ letter, present: groups.some(group => group.letter === letter) })),
      // An empty feed with no search means the feed could not be read, not that nothing
      // is published — say so rather than show an empty catalogue as if it were true.
      unavailable: apis.length === 0,
    });
  }

  /**
   * Hands on to the next route for a name the catalogue does not list, rather than
   * answering 404 itself, so the app's own not found page answers.
   */
  @route('/:name')
  @GET()
  public async detail(req: Request, res: Response, next: NextFunction): Promise<void> {
    const api = (await listedApis()).find(candidate => candidate.name === req.params.name);

    if (!api) {
      next();
      return;
    }

    // The full description from the API's own spec; the feed's short summary if that cannot be had.
    const description = (await getSpecDescription(api.name)) ?? api.description;

    res.render('api-catalogue/detail', {
      api: withTags(api),
      descriptionParagraphs: description ? paragraphsOf(description) : [],
      ...linksFor(api.name),
    });
  }
}

/** The feed's APIs that this site lists: see listedApiNames. */
async function listedApis(): Promise<CatalogueApi[]> {
  return offeredApis(await getCatalogueApis(), listedApiNames());
}

type TaggedApi = CatalogueApi & { domain: string; platform: string };

function withTags(api: CatalogueApi): TaggedApi {
  return { ...api, domain: domainOf(api.name), platform: platformOf(api.name) };
}

function matches(api: CatalogueApi, query: string): boolean {
  const needle = query.toLowerCase();
  return [api.name, api.title, api.description, api.team, domainOf(api.name), platformOf(api.name)].some(field =>
    field?.toLowerCase().includes(needle)
  );
}

/** A to Z in order, then "#". */
function letterOrder(letter: string): number {
  const index = ALPHABET.indexOf(letter);
  return index === -1 ? ALPHABET.length : index;
}

/** The APIs under the first letter of their title; anything not A to Z goes under "#", last. */
function byLetter(apis: TaggedApi[]): { letter: string; apis: TaggedApi[] }[] {
  const groups = new Map<string, TaggedApi[]>();

  for (const api of apis) {
    const first = api.title.charAt(0).toUpperCase();
    const letter = ALPHABET.includes(first) ? first : '#';
    groups.set(letter, [...(groups.get(letter) ?? []), api]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => letterOrder(a) - letterOrder(b))
    .map(([letter, grouped]) => ({ letter, apis: grouped }));
}
