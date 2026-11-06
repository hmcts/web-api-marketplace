import { GET, route } from 'awilix-express';
import { NextFunction, Request, Response } from 'express';

import { CatalogueApi, getCatalogueApi, getCatalogueApis, paragraphsOf } from '../services/ApiCatalogue';

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/**
 * The API catalogue, read from the marketplace backend.
 *
 * The search is an ordinary GET form rather than filtering in the browser, so the catalogue
 * works with JavaScript unavailable and a search can be bookmarked or shared.
 */
@route('/api-catalogue')
export default class ApiCatalogueController {
  @GET()
  public async list(req: Request, res: Response): Promise<void> {
    const apis = await getCatalogueApis();
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const results = query ? apis.filter(api => matches(api, query)) : apis;
    const groups = query ? [] : byLetter(results);

    res.render('api-catalogue/index', {
      query,
      results,
      // Browsing, not searching: the list under a heading per letter, and a row of all 26
      // letters above it. Every letter is shown so the row does not reflow as APIs are
      // added, but only letters with APIs under them are links.
      groups,
      letters: ALPHABET.map(letter => ({ letter, present: groups.some(group => group.letter === letter) })),
      // An empty catalogue with no search means it could not be read, not that nothing is
      // published — say so rather than show an empty catalogue as if it were true.
      unavailable: apis.length === 0,
    });
  }

  /**
   * Hands on to the next route for a short code the catalogue does not list, rather than
   * answering 404 itself, so the app's own not found page answers.
   */
  @route('/:shortCode')
  @GET()
  public async detail(req: Request, res: Response, next: NextFunction): Promise<void> {
    const api = await getCatalogueApi(String(req.params.shortCode));

    if (!api) {
      next();
      return;
    }

    const description = api.description ?? api.summary;

    res.render('api-catalogue/detail', {
      api,
      descriptionParagraphs: description ? paragraphsOf(description) : [],
    });
  }
}

function matches(api: CatalogueApi, query: string): boolean {
  const needle = query.toLowerCase();
  return [api.shortCode, api.title, api.summary, api.team, api.domain, api.platform].some(field =>
    field?.toLowerCase().includes(needle)
  );
}

/** A to Z in order, then "#". */
function letterOrder(letter: string): number {
  const index = ALPHABET.indexOf(letter);
  return index === -1 ? ALPHABET.length : index;
}

/** The APIs under the first letter of their title; anything not A to Z goes under "#", last. */
function byLetter(apis: CatalogueApi[]): { letter: string; apis: CatalogueApi[] }[] {
  const groups = new Map<string, CatalogueApi[]>();

  for (const api of apis) {
    const first = api.title.charAt(0).toUpperCase();
    const letter = ALPHABET.includes(first) ? first : '#';
    groups.set(letter, [...(groups.get(letter) ?? []), api]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => letterOrder(a) - letterOrder(b))
    .map(([letter, grouped]) => ({ letter, apis: grouped }));
}
