import SignInController from '../../../main/controllers/SignInController';
import { pkceChallenge } from '../../../main/services/Entra';
import { anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/EntraUsers', () => ({ saveEntraUser: jest.fn() }));

const { saveEntraUser } = require('../../../main/services/EntraUsers');

process.env.ENTRA_AUTHORIZE_ENDPOINT = 'https://tenant.example/oauth2/v2.0/authorize';

describe('SignInController', () => {
  test('a_signed_in_user_should_go_to_their_account_rather_than_sign_in_again', () => {
    const res = mockResponse();

    new SignInController().get(asUser(), res);

    expect(res.redirected).toBe('/account');
  });

  test('signing_in_should_send_the_browser_to_entra_with_the_state_and_nonce_the_session_holds', () => {
    const res = mockResponse();
    const req = anonymous();

    new SignInController().get(req, res);

    const sentTo = new URL(res.redirected as string);
    expect(sentTo.origin + sentTo.pathname).toBe('https://tenant.example/oauth2/v2.0/authorize');
    expect(req.session.entraSignIn?.state).toMatch(/^[0-9a-f]{32}$/);
    expect(sentTo.searchParams.get('state')).toBe(req.session.entraSignIn?.state);
    expect(sentTo.searchParams.get('nonce')).toBe(req.session.entraSignIn?.nonce);
    expect(sentTo.searchParams.has('prompt')).toBe(false);
  });

  test('signing_in_should_send_the_pkce_challenge_and_keep_its_verifier_in_the_session', () => {
    const res = mockResponse();
    const req = anonymous();

    new SignInController().get(req, res);

    const sentTo = new URL(res.redirected as string);
    const verifier = req.session.entraSignIn?.codeVerifier as string;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sentTo.searchParams.get('code_challenge')).toBe(pkceChallenge(verifier));
    expect(sentTo.searchParams.get('code_challenge_method')).toBe('S256');
    expect(sentTo.toString()).not.toContain(verifier);
  });

  test('each_sign_in_should_get_its_own_state_and_nonce', () => {
    const first = anonymous();
    const second = anonymous();

    new SignInController().get(first, mockResponse());
    new SignInController().get(second, mockResponse());

    expect(first.session.entraSignIn?.state).not.toBe(second.session.entraSignIn?.state);
    expect(first.session.entraSignIn?.nonce).not.toBe(second.session.entraSignIn?.nonce);
    expect(first.session.entraSignIn?.codeVerifier).not.toBe(second.session.entraSignIn?.codeVerifier);
  });

  test('create_should_open_entra_on_its_create_account_form', () => {
    const res = mockResponse();

    new SignInController().get(anonymous({ query: { prompt: 'create' } }), res);

    expect(new URL(res.redirected as string).searchParams.get('prompt')).toBe('create');
  });

  test('a_prompt_we_do_not_use_should_not_be_passed_on', () => {
    const res = mockResponse();

    new SignInController().get(anonymous({ query: { prompt: 'none' } }), res);

    expect(new URL(res.redirected as string).searchParams.has('prompt')).toBe(false);
  });

  describe('BYPASS_ENTRA', () => {
    const environment = { ...process.env };

    beforeEach(() => {
      (saveEntraUser as jest.Mock).mockReset();
      (saveEntraUser as jest.Mock).mockResolvedValue({ id: 7, userReference: 'user007' });
    });

    afterEach(() => {
      process.env = { ...environment };
    });

    test('it_should_start_a_session_without_going_to_entra', async () => {
      process.env.BYPASS_ENTRA = 'true';
      process.env.NODE_ENV = 'development';
      const req = anonymous();
      const res = mockResponse();

      await new SignInController().get(req, res);

      expect(res.redirected).toBe('/account');
      expect(req.session.user).toMatchObject({ id: 7, email: 'john.doe@example.com', name: 'John Doe' });
      // Nothing was started with Entra, so there is no round trip to come back from.
      expect(req.session.entraSignIn).toBeUndefined();
    });

    test('the_user_should_be_saved_in_the_backend_as_a_real_sign_in_saves_it', async () => {
      process.env.BYPASS_ENTRA = 'true';
      process.env.NODE_ENV = 'development';

      await new SignInController().get(anonymous(), mockResponse());

      expect(saveEntraUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'john.doe@example.com', name: 'John Doe' })
      );
    });

    test('a_backend_that_will_not_save_the_user_should_say_sign_in_is_unavailable', async () => {
      process.env.BYPASS_ENTRA = 'true';
      process.env.NODE_ENV = 'development';
      (saveEntraUser as jest.Mock).mockRejectedValue(new Error('could not reach the backend'));
      const req = anonymous();
      const res = mockResponse();

      await new SignInController().get(req, res);

      expect(res.statusCode).toBe(503);
      expect(req.session.user).toBeUndefined();
    });

    test('production_should_go_to_entra_even_with_the_variable_set', async () => {
      process.env.BYPASS_ENTRA = 'true';
      process.env.NODE_ENV = 'production';
      const req = anonymous();
      const res = mockResponse();

      await new SignInController().get(req, res);

      expect(req.session.user).toBeUndefined();
      expect(saveEntraUser).not.toHaveBeenCalled();
      expect(res.redirected).toContain('/oauth2/v2.0/authorize');
    });

    test('without_the_variable_sign_in_should_go_to_entra_as_usual', async () => {
      delete process.env.BYPASS_ENTRA;
      const req = anonymous();
      const res = mockResponse();

      await new SignInController().get(req, res);

      expect(req.session.user).toBeUndefined();
      expect(res.redirected).toContain('/oauth2/v2.0/authorize');
    });
  });
});
