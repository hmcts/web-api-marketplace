/* eslint-disable jest/expect-expect */
import { Response } from 'express';
import { mock } from 'sinon';

import AccessibilityStatementController from '../../../main/controllers/AccessibilityStatementController';
import { mockRequest } from '../mocks/mockRequest';

describe('AccessibilityStatementController', () => {
  test('renders the accessibility-statement view', () => {
    const controller = new AccessibilityStatementController();
    const response = {
      render: () => '',
    } as unknown as Response;
    const data = { pageTitle: 'Accessibility statement for the ‘Find a Court or Tribunal’ service' };
    const request = mockRequest({ accessibilityStatement: data });
    const responseMock = mock(response);

    responseMock.expects('render').once().withArgs('accessibility-statement', data);
    controller.get(request, response);
    responseMock.verify();
  });
});
