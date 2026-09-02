import { Request, Response } from 'express';

import DocumentationController from '../../../main/controllers/DocumentationController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

describe('DocumentationController', () => {
  test('getting_the_index_should_render_it_with_its_locale_data', () => {
    const data = { heading: 'Documentation, guides and tutorials' };
    const res = mockResponse();

    new DocumentationController().get(mockRequest({ documentation: data }), res);

    expect(res.view).toBe('documentation/index');
    expect(res.data).toBe(data);
  });

  test.each([
    ['architecture', 'documentation/architecture'],
    ['architecturePrinciples', 'documentation/architecture-principles'],
    ['caseStudies', 'documentation/case-studies'],
    ['ourApiTechnologies', 'documentation/our-api-technologies'],
    ['ourCapabilities', 'documentation/our-capabilities'],
  ])('calling_%s_should_render_the_%s_view', (method: string, view: string) => {
    const controller = new DocumentationController() as unknown as Record<
      string,
      (req: Request, res: Response) => void
    >;
    const res = mockResponse();

    controller[method]({} as Request, res);

    expect(res.view).toBe(view);
  });
});
