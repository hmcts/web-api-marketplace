import VerifyEmailController from '../../../main/controllers/VerifyEmailController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { register, verifyEmail } from '../../../main/services/Accounts';
import { anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

const registration = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  orgName: 'Analytical Engines Ltd',
  role: 'consumer' as const,
  password: 'correct horse battery',
};

describe('VerifyEmailController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('a_valid_token_should_confirm_the_account', async () => {
    const { token } = (await register(registration)) as { token: string };
    const res = mockResponse();

    await new VerifyEmailController().verify(anonymous({ query: { token } }), res);

    expect(res.view).toBe('register/verified');
    expect(res.data).toEqual({ firstName: 'Ada' });
  });

  test('an_unknown_or_missing_token_should_say_the_link_has_expired', async () => {
    for (const query of [{ token: 'nonsense' }, {}] as Record<string, string>[]) {
      const res = mockResponse();

      await new VerifyEmailController().verify(anonymous({ query }), res);

      expect(res.statusCode).toBe(400);
      expect(res.view).toBe('register/link-expired');
    }
  });

  test('the_resend_form_should_offer_the_address_last_used', () => {
    const res = mockResponse();

    new VerifyEmailController().resendForm(anonymous({ session: { emailSentTo: 'ada@example.com' } }), res);

    expect(res.view).toBe('register/resend');
    expect(res.data).toEqual({ email: 'ada@example.com' });
  });

  test('resending_to_a_bad_address_should_be_refused', async () => {
    const res = mockResponse();

    await new VerifyEmailController().resend(anonymous({ body: { email: 'nope' } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.data?.error).toContain('correct format');
  });

  test('resending_to_an_unverified_account_should_send_a_new_link', async () => {
    await register(registration);
    const req = anonymous({ body: { email: 'ada@example.com' } });
    const res = mockResponse();

    await new VerifyEmailController().resend(req, res);

    expect(res.redirected).toBe('/register/check-email');
    expect(req.session.outbox?.link?.href).toMatch(/^\/verify-email\?token=/);
  });

  test('resending_to_a_verified_or_unknown_account_should_send_nothing_but_say_the_same', async () => {
    const { token } = (await register(registration)) as { token: string };
    await verifyEmail(token);

    for (const email of ['ada@example.com', 'nobody@example.com']) {
      const req = anonymous({ body: { email } });
      const res = mockResponse();

      await new VerifyEmailController().resend(req, res);

      expect(res.redirected).toBe('/register/check-email');
      expect(req.session.emailSentTo).toBe(email);
      expect(req.session.outbox).toBeUndefined();
    }
  });
});
