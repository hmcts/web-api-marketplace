import WelcomeController, { ROLES } from '../../../main/controllers/WelcomeController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { findProfile } from '../../../main/services/Profiles';
import { LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

/** Straight back from Entra's create-account page: a name and email, nothing else yet. */
const NEW_USER = { ...LOCAL_USER, orgName: '', role: undefined };

const COMPLETE = { organisation: 'Analytical Engines Ltd', role: 'consumer', agree: 'yes' };

describe('WelcomeController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('a_signed_out_visitor_should_be_sent_to_sign_in', async () => {
    const res = mockResponse();

    new WelcomeController().get(anonymous(), res);
    await new WelcomeController().post(anonymous(), res);

    expect(res.redirected).toBe('/sign-in');
  });

  test('the_page_should_show_what_entra_said_and_ask_for_the_rest', () => {
    const res = mockResponse();

    new WelcomeController().get(asUser({ session: { user: NEW_USER as never } }), res);

    expect(res.view).toBe('account/welcome');
    expect(res.data?.profile).toEqual(NEW_USER);
    expect(res.data?.answers).toEqual({ organisation: '', role: '' });
    expect(res.data?.roles).toBe(ROLES);
  });

  test('continuing_with_nothing_should_ask_for_each_answer', async () => {
    const res = mockResponse();

    await new WelcomeController().post(asUser({ body: {}, session: { user: NEW_USER as never } }), res);

    expect(res.statusCode).toBe(400);
    expect((res.data?.errors as { name: string }[]).map(error => error.name)).toEqual([
      'organisation',
      'role',
      'agree',
    ]);
    expect(await findProfile(LOCAL_USER.oid)).toBeUndefined();
  });

  test('an_account_type_we_do_not_offer_should_be_refused', async () => {
    const res = mockResponse();

    await new WelcomeController().post(asUser({ body: { ...COMPLETE, role: 'admin' } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.data?.errorFor).toEqual({ role: 'Select whether you are a consumer or a producer' });
  });

  test('continuing_without_agreeing_should_be_refused', async () => {
    const res = mockResponse();

    await new WelcomeController().post(asUser({ body: { ...COMPLETE, agree: undefined } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.data?.errorFor).toEqual({ agree: 'Confirm that you have read and agree to the guidelines' });
  });

  test('completing_it_should_keep_the_profile_against_the_oid_and_go_to_applications', async () => {
    const res = mockResponse();
    const req = asUser({ body: { ...COMPLETE, role: 'producer' }, session: { user: NEW_USER as never } });

    await new WelcomeController().post(req, res);

    expect(res.redirected).toBe('/account/applications');
    expect(await findProfile(LOCAL_USER.oid)).toEqual({
      orgName: 'Analytical Engines Ltd',
      role: 'producer',
      onboardedAt: expect.any(String),
    });
    expect(req.session.user).toEqual({ ...NEW_USER, orgName: 'Analytical Engines Ltd', role: 'producer' });
  });

  test('completing_it_should_carry_on_to_wherever_sign_in_interrupted', async () => {
    const res = mockResponse();

    await new WelcomeController().post(
      asUser({ body: COMPLETE, session: { returnTo: '/account/production-credentials' } }),
      res
    );

    expect(res.redirected).toBe('/account/production-credentials');
  });
});
