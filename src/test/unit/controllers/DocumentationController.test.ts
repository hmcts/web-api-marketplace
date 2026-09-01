/* eslint-disable jest/expect-expect */
import { Response } from 'express';
import { mock } from 'sinon';

import DocumentationController from '../../../main/controllers/DocumentationController';
import { mockRequest } from '../mocks/mockRequest';

describe('DocumentationController', () => {
  test('getting_the_page_should_render_the_documentation_view_with_its_locale_data', () => {
    const controller = new DocumentationController();
    const response = {
      render: () => '',
    } as unknown as Response;
    const data = { heading: 'Documentation, guides and tutorials' };
    const request = mockRequest({ documentation: data });
    const responseMock = mock(response);

    responseMock.expects('render').once().withArgs('documentation', data);
    controller.get(request, response);
    responseMock.verify();
  });
});
