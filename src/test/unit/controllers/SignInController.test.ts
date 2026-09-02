import SignInController from '../../../main/controllers/SignInController';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/SignIn', () => ({ signIn: jest.fn() }));

const { signIn } = require('../../../main/services/SignIn');

const content = {
  heading: 'Sign in',
  errorMissing: 'Enter your email address and password',
  errorRejected: 'Incorrect email or password',
};

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

  test('a_successful_sign_in_should_store_the_user_and_redirect_to_the_account', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user: { email: 'joe@example.com' } });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'joe@example.com', password: 'any' };

    await controller.post(req, res);

    expect(req.session.user).toEqual({ email: 'joe@example.com' });
    expect(res.redirected).toBe('/account');
  });

  test('a_successful_sign_in_should_regenerate_the_session_id', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user: { email: 'joe@example.com' } });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    const regenerate = jest.spyOn(req.session, 'regenerate');
    req.body = { email: 'joe@example.com', password: 'any' };

    await controller.post(req, res);

    // Guards against session fixation: an id planted before sign in must not survive it.
    expect(regenerate).toHaveBeenCalled();
  });

  test('visiting_sign_in_while_already_signed_in_should_redirect_to_the_account', () => {
    const controller = new SignInController();
    const res = mockResponse();

    controller.get(mockRequest({ signIn: content }, { user: { email: 'joe@example.com' } as never }), res);

    expect(res.redirected).toBe('/account');
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
