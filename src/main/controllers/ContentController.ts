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
  '/get-started/onboarding-guide': 'content/get-started/onboarding-guide',
  '/get-started/consumer-guidance': 'content/get-started/consumer-guidance',
  '/get-started/building-software': 'content/get-started/building-software',
  '/get-started/technology-introduction': 'content/get-started/technology-introduction',
  '/get-started/glossary': 'content/get-started/glossary',
  '/documentation': 'content/documentation/index',
  '/documentation/architecture': 'content/documentation/architecture',
  '/documentation/architecture-principles': 'content/documentation/architecture-principles',
  '/documentation/case-studies': 'content/documentation/case-studies',
  '/documentation/our-api-technologies': 'content/documentation/our-api-technologies',
  '/documentation/our-capabilities': 'content/documentation/our-capabilities',
  '/help': 'content/help/index',
  '/help/resources': 'content/help/resources',
  '/publish/guidance': 'content/publish/guidance/index',
  '/publish/guidance/producer-standards': 'content/publish/guidance/producer-standards',
  '/publish/guidance/data-governance': 'content/publish/guidance/data-governance',
  '/privacy': 'content/privacy',
};

export default class ContentController {
  public get(req: Request, res: Response): void {
    // req.path, not req.route.path: every page shares the one route, whose path is the
    // whole list. A trailing slash still reaches the page, as express matches it anyway.
    res.render(CONTENT_PAGES[req.path.replace(/(.)\/$/, '$1')]);
  }
}

// Applied by hand rather than written above the method: one @route per page, generated
// from the table, so the table stays the only list of pages.
for (const path of Object.keys(CONTENT_PAGES)) {
  route(path)(ContentController.prototype, 'get');
}
GET()(ContentController.prototype, 'get');
