import WelcomeController from '../../../main/controllers/WelcomeController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { findProfile } from '../../../main/services/Profiles';
import { LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

const AGREED = { agree: 'yes' };

describe('WelcomeController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('a_signed_out_visitor_should_be_sent_to_sign_in', async () => {
    const res = mockResponse();

    new WelcomeController().get(anonymous(), res);
    await new WelcomeController().post(anonymous(), res);

    expect(res.redirected).toBe('/sign-in');
  });

  test('the_page_should_show_what_entra_said_and_the_guidelines', () => {
    const res = mockResponse();

    new WelcomeController().get(asUser({ session: { user: LOCAL_USER as never } }), res);

    expect(res.view).toBe('account/welcome');
    expect(res.data?.profile).toEqual(LOCAL_USER);
    expect(res.data?.errors).toEqual([]);
  });

  test('continuing_without_agreeing_should_be_refused', async () => {
    const res = mockResponse();

    await new WelcomeController().post(asUser({ body: {} }), res);

    expect(res.statusCode).toBe(400);
    expect(res.data?.errorFor).toEqual({ agree: 'Confirm that you have read and agree to the guidelines' });
    expect(await findProfile(LOCAL_USER.oid)).toBeUndefined();
  });

  test('agreeing_should_record_it_against_the_oid_and_go_to_applications', async () => {
    const res = mockResponse();
    const req = asUser({ body: AGREED, session: { user: LOCAL_USER as never } });

    await new WelcomeController().post(req, res);

    expect(res.redirected).toBe('/account/applications');
    expect(await findProfile(LOCAL_USER.oid)).toEqual({ onboardedAt: expect.any(String) });
    expect(req.session.user).toEqual(LOCAL_USER);
  });

  test('agreeing_should_carry_on_to_wherever_sign_in_interrupted', async () => {
    const res = mockResponse();

    await new WelcomeController().post(
      asUser({ body: AGREED, session: { returnTo: '/account/production-credentials' } }),
      res
    );

    expect(res.redirected).toBe('/account/production-credentials');
  });
});
