import { GET, route } from 'awilix-express';
import { NextFunction, Request, Response } from 'express';

import { CatalogueApi, getCatalogueApis, linksFor } from '../services/ApiCatalogue';

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
    const apis = await getCatalogueApis();
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const results = query ? apis.filter(api => matches(api, query)) : apis;

    res.render('api-catalogue/index', {
      query,
      results,
      // An empty feed with no search means the feed could not be read, not that nothing
      // is published — say so rather than show an empty catalogue as if it were true.
      unavailable: apis.length === 0,
    });
  }

  /**
   * Hands on to the next route for a name the catalogue does not list, rather than
   * answering 404 itself: /api-catalogue/request-new-api is another controller's, and
   * this one is registered first.
   */
  @route('/:name')
  @GET()
  public async detail(req: Request, res: Response, next: NextFunction): Promise<void> {
    const api = (await getCatalogueApis()).find(candidate => candidate.name === req.params.name);

    if (!api) {
      next();
      return;
    }

    res.render('api-catalogue/detail', { api, ...linksFor(api.name) });
  }
}

function matches(api: CatalogueApi, query: string): boolean {
  const needle = query.toLowerCase();
  return [api.name, api.title, api.description, api.team].some(field => field?.toLowerCase().includes(needle));
}
