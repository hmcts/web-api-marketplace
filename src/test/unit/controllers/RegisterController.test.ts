import { Response } from 'express';

import RegisterController from '../../../main/controllers/RegisterController';
import { mockRequest } from '../mocks/mockRequest';

const content = { heading: 'Not implemented' };

function mockResponse(): Response & { view?: string; data?: Record<string, unknown> } {
  const res: Record<string, unknown> = {};
  res.render = jest.fn().mockImplementation((view: string, data: Record<string, unknown>) => {
    res.view = view;
    res.data = data;
  });
  return res as never;
}

describe('RegisterController', () => {
  test('visiting_register_should_render_the_not_implemented_page', () => {
    const res = mockResponse();

    new RegisterController().get(mockRequest({ notImplemented: content }), res);

    expect(res.view).toBe('not-implemented');
    expect(res.data?.heading).toBe('Not implemented');
  });
});
