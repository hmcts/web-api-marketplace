/* eslint-disable jest/expect-expect */
import { Response } from 'express';
import { mock } from 'sinon';

import CookiesController from '../../../main/controllers/CookiesController';
import { mockRequest } from '../mocks/mockRequest';

describe('CookiesController', () => {
  test('renders the cookie policy view', () => {
    const controller = new CookiesController();
    const response = {
      render: () => '',
    } as unknown as Response;
    const cookiesData = { header: 'Cookies' };
    const request = mockRequest({ cookies: cookiesData });
    const responseMock = mock(response);

    responseMock.expects('render').once().withArgs('cookies', cookiesData);
    controller.get(request, response);
    responseMock.verify();
  });
});
