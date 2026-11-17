import { GET, route } from 'awilix-express';
import { Request, Response } from 'express';

/**
 * The guidance pages migrated from the GitHub Pages site at hmcts.github.io/hmcts-api-marketplace.
 *
 * They are static content: no data, no form, nothing that differs between visitors beyond
 * the navigation. One controller and a fixed table, rather than a controller per page, so
 * adding a page is one line here and one template — and only the paths listed are routed,
 * so nothing typed into the address bar can choose which template is rendered.
 */
export const CONTENT_PAGES: Record<string, string> = {
  '/get-started': 'content/get-started/index',
  '/documentation': 'content/documentation/index',
  '/documentation/consumer-guidance': 'content/documentation/consumer-guidance',
  '/documentation/producer-onboarding': 'content/documentation/producer-onboarding',
  '/documentation/producer-guidance': 'content/documentation/producer-guidance',
  '/help': 'content/help/index',
  '/privacy': 'content/privacy',
};

/**
 * Pages that have moved, and where they went. Only an address whose page now lives somewhere
 * else belongs here: an address that was retired is left to answer 404.
 */
export const MOVED_PAGES: Record<string, string> = {
  '/documentation/producer-standards': '/documentation/producer-guidance',
};

const withoutTrailingSlash = (path: string): string => path.replace(/(.)\/$/, '$1');

export default class ContentController {
  public get(req: Request, res: Response): void {
    // req.path, not req.route.path: every page shares the one route, whose path is the
    // whole list. A trailing slash still reaches the page, as express matches it anyway.
    res.render(CONTENT_PAGES[withoutTrailingSlash(req.path)]);
  }

  public moved(req: Request, res: Response): void {
    res.redirect(301, MOVED_PAGES[withoutTrailingSlash(req.path)]);
  }
}

// Applied by hand rather than written above the method: one @route per page, generated
// from the table, so the table stays the only list of pages.
for (const path of Object.keys(CONTENT_PAGES)) {
  route(path)(ContentController.prototype, 'get');
}
GET()(ContentController.prototype, 'get');

for (const path of Object.keys(MOVED_PAGES)) {
  route(path)(ContentController.prototype, 'moved');
}
GET()(ContentController.prototype, 'moved');
