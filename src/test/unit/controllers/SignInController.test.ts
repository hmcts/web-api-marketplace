import SignInController from '../../../main/controllers/SignInController';
import { anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

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

  test('each_sign_in_should_get_its_own_state_and_nonce', () => {
    const first = anonymous();
    const second = anonymous();

    new SignInController().get(first, mockResponse());
    new SignInController().get(second, mockResponse());

    expect(first.session.entraSignIn?.state).not.toBe(second.session.entraSignIn?.state);
    expect(first.session.entraSignIn?.nonce).not.toBe(second.session.entraSignIn?.nonce);
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
});
