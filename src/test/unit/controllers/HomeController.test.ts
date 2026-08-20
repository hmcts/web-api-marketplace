/* eslint-disable jest/expect-expect */
import { Response } from 'express';
import { mock } from 'sinon';

import HomeController from '../../../main/controllers/HomeController';
import { mockRequest } from '../mocks/mockRequest';

describe('HomeController', () => {
  test('renders the home view', () => {
    const controller = new HomeController();
    const response = {
      render: () => '',
    } as unknown as Response;
    const data = { pageTitle: 'Default page template' };
    const request = mockRequest({ home: data });
    const responseMock = mock(response);

    responseMock.expects('render').once().withArgs('home', data);
    controller.get(request, response);
    responseMock.verify();
  });
});
