import RegisterController from '../../../main/controllers/RegisterController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

const content = { heading: 'Not implemented' };

describe('RegisterController', () => {
  test('visiting_register_should_render_the_not_implemented_page', () => {
    const res = mockResponse();

    new RegisterController().get(mockRequest({ notImplemented: content }), res);

    expect(res.view).toBe('not-implemented');
    expect(res.data?.heading).toBe('Not implemented');
  });
});
