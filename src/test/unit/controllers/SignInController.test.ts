import { Response } from 'express';

import SignInController from '../../../main/controllers/SignInController';
import { mockRequest } from '../mocks/mockRequest';

jest.mock('../../../main/services/SignIn', () => ({ signIn: jest.fn() }));

const { signIn } = require('../../../main/services/SignIn');

const content = {
  heading: 'Sign in',
  errorMissing: 'Enter your email address and password',
  errorRejected: 'Incorrect email or password',
};

function mockResponse(): Response & {
  statusCode?: number;
  view?: string;
  data?: Record<string, unknown>;
  redirected?: string;
} {
  const res: Record<string, unknown> = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.render = jest.fn().mockImplementation((view: string, data: Record<string, unknown>) => {
    res.view = view;
    res.data = data;
  });
  res.redirect = jest.fn().mockImplementation((to: string) => {
    res.redirected = to;
  });
  return res as never;
}

describe('SignInController', () => {
  beforeEach(() => (signIn as jest.Mock).mockReset());

  test('getting_the_page_should_render_the_sign_in_view', () => {
    const controller = new SignInController();
    const res = mockResponse();

    controller.get(mockRequest({ signIn: content }), res);

    expect(res.view).toBe('sign-in');
  });

  test('posting_without_credentials_should_return_400_and_not_call_the_backend', async () => {
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: '', password: '' };

    await controller.post(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.data?.error).toBe(content.errorMissing);
    expect(signIn).not.toHaveBeenCalled();
  });

  test('a_rejected_sign_in_should_return_401_with_a_generic_message', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: false });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'nobody@example.com', password: 'x' };

    await controller.post(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.data?.error).toBe(content.errorRejected);
  });

  test('a_successful_sign_in_should_redirect_home', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user: { email: 'joe@example.com' } });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'joe@example.com', password: 'any' };

    await controller.post(req, res);

    expect(res.redirected).toBe('/');
  });

  test('the_email_should_be_returned_to_the_page_on_error_but_never_the_password', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: false });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'joe@example.com', password: 's3cr3t' };

    await controller.post(req, res);

    expect(res.data?.email).toBe('joe@example.com');
    expect(JSON.stringify(res.data)).not.toContain('s3cr3t');
  });
});
