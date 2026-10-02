import WelcomeController from '../../../main/controllers/WelcomeController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { isOnboarded } from '../../../main/services/Accounts';
import { LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

describe('WelcomeController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('a_signed_out_visitor_should_be_sent_to_sign_in', async () => {
    const res = mockResponse();

    new WelcomeController().get(anonymous(), res);
    await new WelcomeController().post(anonymous(), res);

    expect(res.redirected).toBe('/sign-in');
  });

  test('the_page_should_show_the_profile', () => {
    const res = mockResponse();

    new WelcomeController().get(asUser(), res);

    expect(res.view).toBe('account/welcome');
    expect(res.data).toEqual({ profile: LOCAL_USER });
  });

  test('continuing_without_agreeing_should_be_refused', async () => {
    const res = mockResponse();

    await new WelcomeController().post(asUser({ body: {} }), res);

    expect(res.statusCode).toBe(400);
    expect(res.data?.error).toContain('agree to the guidelines');
    expect(await isOnboarded(LOCAL_USER.email)).toBe(false);
  });

  test('agreeing_should_record_it_and_go_to_applications', async () => {
    const res = mockResponse();

    await new WelcomeController().post(asUser({ body: { agree: 'yes' } }), res);

    expect(res.redirected).toBe('/account/applications');
    expect(await isOnboarded(LOCAL_USER.email)).toBe(true);
  });

  test('agreeing_should_carry_on_to_wherever_sign_in_interrupted', async () => {
    const res = mockResponse();

    await new WelcomeController().post(
      asUser({ body: { agree: 'yes' }, session: { returnTo: '/account/production-credentials' } }),
      res
    );

    expect(res.redirected).toBe('/account/production-credentials');
  });
});
