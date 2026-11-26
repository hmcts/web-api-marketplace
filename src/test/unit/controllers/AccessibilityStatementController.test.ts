/* eslint-disable jest/expect-expect */
import { Response } from 'express';
import { mock } from 'sinon';

import AccessibilityStatementController from '../../../main/controllers/AccessibilityStatementController';
import { mockRequest } from '../mocks/mockRequest';

describe('AccessibilityStatementController', () => {
  test('the_accessibility_statement_should_render_its_view_with_its_content', () => {
    const controller = new AccessibilityStatementController();
    const response = {
      render: () => '',
    } as unknown as Response;
    const data = { pageTitle: 'Accessibility statement - HMCTS API Marketplace - GOV.UK' };
    const request = mockRequest({ accessibilityStatement: data });
    const responseMock = mock(response);

    responseMock.expects('render').once().withArgs('accessibility-statement', data);
    controller.get(request, response);
    responseMock.verify();
  });
});
