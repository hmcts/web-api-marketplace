import RegisterController from '../../../main/controllers/RegisterController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { register } from '../../../main/services/Accounts';
import { anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

const valid = {
  'first-name': 'Ada',
  'last-name': 'Lovelace',
  email: 'ada@example.com',
  organisation: 'Analytical Engines Ltd',
  role: 'consumer',
  password: 'correct horse battery',
  'password-confirm': 'correct horse battery',
};

const errorNames = (data?: Record<string, unknown>) => (data?.errors as { name: string }[]).map(error => error.name);

describe('RegisterController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('the_form_should_render_for_a_visitor', () => {
    const res = mockResponse();

    new RegisterController().get(anonymous(), res);

    expect(res.view).toBe('register/index');
    expect(res.data?.errors).toEqual([]);
  });

  test('someone_signed_in_should_go_to_their_account', () => {
    const res = mockResponse();

    new RegisterController().get(asUser(), res);

    expect(res.redirected).toBe('/account');
  });

  test('an_empty_form_should_report_every_field_in_order', async () => {
    const res = mockResponse();

    await new RegisterController().post(anonymous({ body: {} }), res);

    expect(res.statusCode).toBe(400);
    expect(errorNames(res.data)).toEqual(['first-name', 'last-name', 'email', 'organisation', 'role', 'password']);
  });

  test.each([
    [{ 'first-name': 'x'.repeat(101) }, 'first-name', 'must be 100 characters or fewer'],
    [{ email: 'not-an-address' }, 'email', 'correct format'],
    [{ 'password-confirm': 'something else entirely' }, 'password-confirm', 'do not match'],
  ])('a_bad_answer_%j_should_be_reported_against_%s', async (change, name, text) => {
    const res = mockResponse();

    await new RegisterController().post(anonymous({ body: { ...valid, ...change } }), res);

    expect(res.data?.errorFor).toEqual({ [name]: expect.stringContaining(text) });
  });

  test('a_new_address_should_be_sent_a_confirmation_link', async () => {
    const req = anonymous({ body: valid });
    const res = mockResponse();

    await new RegisterController().post(req, res);

    expect(res.redirected).toBe('/register/check-email');
    expect(req.session.emailSentTo).toBe('ada@example.com');
    expect(req.session.outbox).toMatchObject({ template: 'verify-email', to: 'ada@example.com' });
    expect(req.session.outbox?.link?.href).toMatch(/^\/verify-email\?token=/);
  });

  test('a_registered_address_should_be_told_it_already_has_an_account', async () => {
    await register({ ...valid, firstName: 'Ada', lastName: 'Lovelace', orgName: 'AE', role: 'consumer' });
    const req = anonymous({ body: valid });
    const res = mockResponse();

    await new RegisterController().post(req, res);

    expect(res.redirected).toBe('/register/check-email');
    expect(req.session.outbox).toMatchObject({ template: 'already-registered', link: { href: '/sign-in' } });
  });

  test('check_email_should_show_the_address_and_the_email', () => {
    const res = mockResponse();
    const outbox = { template: 'verify-email' as const, to: 'ada@example.com', subject: 's', paragraphs: [] };

    new RegisterController().checkEmail(anonymous({ session: { emailSentTo: 'ada@example.com', outbox } }), res);

    expect(res.view).toBe('register/check-email');
    expect(res.data).toEqual({ address: 'ada@example.com', outbox });
  });

  test('check_email_with_nothing_sent_should_go_back_to_the_form', () => {
    const res = mockResponse();

    new RegisterController().checkEmail(anonymous(), res);

    expect(res.redirected).toBe('/register');
  });
});
