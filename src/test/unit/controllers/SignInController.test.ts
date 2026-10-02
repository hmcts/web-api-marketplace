import SignInController from '../../../main/controllers/SignInController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { markOnboarded } from '../../../main/services/Accounts';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/SignIn', () => ({ signIn: jest.fn() }));

const { signIn } = require('../../../main/services/SignIn');

const content = {
  heading: 'Sign in',
  errorMissing: 'Enter your email address and password',
  errorRejected: 'Incorrect email or password',
  errorUnavailable: 'Sign in is not available at the moment',
};

describe('SignInController', () => {
  beforeEach(() => {
    (signIn as jest.Mock).mockReset();
    useDataStore(new MemoryStore());
  });

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

  test('an_unreachable_backend_should_return_503_and_say_the_service_is_unavailable', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: false, unavailable: true });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'joe@example.com', password: 'any' };

    await controller.post(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.data?.serviceError).toBe(content.errorUnavailable);
    // Not a 401 and not blamed on the credentials, which were never judged.
    expect(res.data?.error).toBeUndefined();
  });

  test('an_outage_should_keep_the_email_so_the_user_can_simply_retry', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: false, unavailable: true });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'joe@example.com', password: 's3cr3t' };

    await controller.post(req, res);

    expect(res.data?.email).toBe('joe@example.com');
    expect(JSON.stringify(res.data)).not.toContain('s3cr3t');
  });

  test('a_rejected_sign_in_should_not_be_reported_as_a_service_error', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: false });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'nobody@example.com', password: 'x' };

    await controller.post(req, res);

    expect(res.data?.serviceError).toBeUndefined();
  });

  test('a_first_sign_in_should_store_the_user_and_redirect_to_the_welcome', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user: { email: 'joe@example.com' } });
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'joe@example.com', password: 'any' };

    await controller.post(req, res);

    expect(req.session.user).toEqual({ email: 'joe@example.com' });
    expect(res.redirected).toBe('/account/welcome');
  });

  test('a_later_sign_in_should_redirect_to_the_account', async () => {
    (signIn as jest.Mock).mockResolvedValue({ ok: true, user: { email: 'joe@example.com' } });
    await markOnboarded('joe@example.com');
    const controller = new SignInController();
    const res = mockResponse();
    const req = mockRequest({ signIn: content });
    req.body = { email: 'joe@example.com', password: 'any' };

    await controller.post(req, res);

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

  describe('accounts registered here', () => {
    const { register, verifyEmail } = require('../../../main/services/Accounts');
    const PASSWORD = 'correct horse battery';

    async function registered(verified: boolean): Promise<void> {
      const { token } = await register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        orgName: 'AE',
        role: 'consumer',
        password: PASSWORD,
      });
      if (verified) {
        await verifyEmail(token);
      }
    }

    async function signInAs(password: string) {
      const res = mockResponse();
      const req = mockRequest({ signIn: content });
      req.body = { email: 'ada@example.com', password };
      await new SignInController().post(req, res);
      return { req, res };
    }

    test('a_confirmed_account_should_sign_in_without_asking_the_backend', async () => {
      await registered(true);

      const { req, res } = await signInAs(PASSWORD);

      expect(res.redirected).toBe('/account/welcome');
      expect(req.session.user).toMatchObject({ email: 'ada@example.com', local: true });
      expect(signIn).not.toHaveBeenCalled();
    });

    test('a_wrong_password_should_be_refused_here', async () => {
      await registered(true);

      const { res } = await signInAs('not the password');

      expect(res.statusCode).toBe(401);
      expect(res.data?.error).toBe(content.errorRejected);
      expect(signIn).not.toHaveBeenCalled();
    });

    test('an_unconfirmed_account_should_be_told_to_confirm_its_address', async () => {
      await registered(false);

      const { res } = await signInAs(PASSWORD);

      expect(res.statusCode).toBe(401);
      expect(res.data?.unverified).toBe(true);
    });

    test('a_failed_session_regeneration_should_not_sign_anyone_in', async () => {
      await registered(true);
      const res = mockResponse();
      const req = mockRequest({ signIn: content });
      req.body = { email: 'ada@example.com', password: PASSWORD };
      req.session.regenerate = ((callback: (err?: unknown) => void) => callback(new Error('store down'))) as never;

      await new SignInController().post(req, res);

      expect(res.statusCode).toBe(500);
      expect(req.session.user).toBeUndefined();
    });
  });
});
