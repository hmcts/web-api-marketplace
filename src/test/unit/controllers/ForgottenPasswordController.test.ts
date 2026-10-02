import ForgottenPasswordController from '../../../main/controllers/ForgottenPasswordController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { register } from '../../../main/services/Accounts';
import { anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

describe('ForgottenPasswordController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('the_form_should_render', () => {
    const res = mockResponse();

    new ForgottenPasswordController().get(anonymous(), res);

    expect(res.view).toBe('password/forgotten');
  });

  test.each([
    ['', 'Enter your email address'],
    ['not-an-address', 'correct format'],
  ])('the_address_%j_should_be_refused', async (email, message) => {
    const res = mockResponse();

    await new ForgottenPasswordController().post(anonymous({ body: { email } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.data?.error).toContain(message);
  });

  test('an_account_registered_here_should_be_sent_a_reset_link', async () => {
    await register({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      orgName: 'AE',
      role: 'consumer',
      password: 'correct horse battery',
    });
    const req = anonymous({ body: { email: 'ada@example.com' } });
    const res = mockResponse();

    await new ForgottenPasswordController().post(req, res);

    expect(res.redirected).toBe('/forgotten-password/check-email');
    expect(req.session.outbox?.link?.href).toMatch(/^\/reset-password\?token=/);
  });

  test('an_unknown_address_should_get_the_same_answer_and_no_email', async () => {
    const req = anonymous({ body: { email: 'nobody@example.com' } });
    const res = mockResponse();

    await new ForgottenPasswordController().post(req, res);

    expect(res.redirected).toBe('/forgotten-password/check-email');
    expect(req.session.emailSentTo).toBe('nobody@example.com');
    expect(req.session.outbox).toBeUndefined();
  });

  test('check_email_should_show_the_address', () => {
    const res = mockResponse();

    new ForgottenPasswordController().checkEmail(anonymous({ session: { emailSentTo: 'ada@example.com' } }), res);

    expect(res.view).toBe('password/check-email');
    expect(res.data?.address).toBe('ada@example.com');
  });

  test('check_email_with_nothing_sent_should_go_back_to_the_form', () => {
    const res = mockResponse();

    new ForgottenPasswordController().checkEmail(anonymous(), res);

    expect(res.redirected).toBe('/forgotten-password');
  });
});
