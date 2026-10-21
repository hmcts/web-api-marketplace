import axios from 'axios';

import { MemoryStore, useDataStore } from '../../../main/modules/store';
import {
  APPLICATION_ROLE,
  Application,
  BackendError,
  createApplication,
  deleteApplication,
  getApplication,
  grantAccess,
  listApplications,
  maskSecret,
  ownerOf,
  setApis,
  shortCodeFor,
  subscriptionKey,
  validateApis,
  validateName,
} from '../../../main/services/Applications';
import { CATALOGUE } from '../helpers/consumer';

jest.mock('axios');

const request = axios.request as jest.MockedFunction<typeof axios.request>;

const OWNER = { oid: '11111111-2222-3333-4444-555555555555', userReference: 'user001' };
const BACKEND_APP = {
  clientId: '1bf041a2-a57a-4255-b90f-d218736cda1f',
  tenantId: 'd44f885c-4fac-47bf-afde-d7d861ec4d7b',
  name: 'Case Viewer',
  appname: 'case-viewer',
  secretHint: 'Uc6',
  secretExpiresAt: '2028-10-15T12:00:00',
  createdAt: '2026-10-15T12:00:00',
};

const ok = (data?: unknown) => Promise.resolve({ status: 200, data } as never);
const refused = (status: number, error = 'Refused') =>
  Promise.reject(Object.assign(new Error('Request failed'), { response: { status, data: { error } } }));

function answer(routes: Record<string, () => Promise<never>>) {
  request.mockImplementation(config => {
    const key = `${config.method} ${config.url}`;
    const match = Object.keys(routes).find(route =>
      route.endsWith('*') ? key.startsWith(route.slice(0, -1)) : key === route
    );
    if (!match) {
      throw new Error(`Unexpected call: ${key}`);
    }
    return routes[match]();
  });
}

const call = (index: number) =>
  request.mock.calls[index][0] as { method?: string; url?: string; data: Record<string, string>; headers?: unknown };

describe('Applications', () => {
  beforeEach(() => {
    request.mockReset();
    useDataStore(new MemoryStore());
  });

  describe('naming and validation', () => {
    test.each(['Case Viewer', 'Report X', 'A'.repeat(50)])('the_name_%s_should_be_accepted', name => {
      expect(validateName(name)).toEqual([]);
    });

    test.each([
      ['', 'Enter an application name'],
      ['Reports', 'Application name must be 8 to 50 letters, numbers or spaces'],
      ['Case-Viewer', 'Application name must be 8 to 50 letters, numbers or spaces'],
      ['A'.repeat(51), 'Application name must be 8 to 50 letters, numbers or spaces'],
    ])('the_name_%p_should_be_refused', (name, text) => {
      expect(validateName(name)).toEqual([{ name: 'name', text }]);
    });

    test('at_least_one_api_from_the_catalogue_should_be_chosen', () => {
      expect(validateApis([], CATALOGUE)).toHaveLength(1);
      expect(validateApis(['api-unknown'], CATALOGUE)).toHaveLength(1);
      expect(validateApis(['api-one'], CATALOGUE)).toEqual([]);
    });

    test('the_owner_should_carry_the_users_reference_or_one_formatted_from_their_id', () => {
      expect(ownerOf({ id: 7, userReference: 'user007', oid: 'o', email: '', name: '' })).toEqual({
        oid: 'o',
        userReference: 'user007',
      });
      expect(ownerOf({ id: 42, oid: 'o', email: '', name: '' }).userReference).toBe('user042');
      expect(ownerOf({ id: 1234, oid: 'o', email: '', name: '' }).userReference).toBe('user1234');
    });

    test('an_api_the_marketplace_holds_should_map_to_its_short_code_and_the_secret_should_be_masked', () => {
      expect(shortCodeFor('api-one')).toBe('one');
      expect(shortCodeFor('api-not-in-the-marketplace')).toBeUndefined();
      expect(maskSecret('Uc6')).toBe('Uc6****');
    });
  });

  describe('creating', () => {
    test('should_register_with_the_name_then_subscribe_each_api_and_return_the_secret_once', async () => {
      answer({
        'POST /applications': () => ok({ ...BACKEND_APP, clientSecret: 'Uc6Q~secret' }),
        'POST /apim/subscription-keys': () =>
          ok({
            title: 'API one',
            productId: 'try-it-now-one',
            subscriptionName: 'amp-user001-case-viewer-one',
            subscriptionKey: 'c5212ea63015c827b1a0f713fdbf42d6',
          }),
      });

      const created = await createApplication(
        OWNER,
        { name: ' Case Viewer ', apis: ['api-one', 'api-two'] },
        CATALOGUE
      );

      expect(call(0)).toMatchObject({
        method: 'POST',
        url: '/applications',
        data: { name: 'Case Viewer' },
        headers: { requestingUserId: OWNER.oid },
      });
      expect(call(1).data).toEqual({ clientId: BACKEND_APP.clientId, shortCode: 'one' });
      expect(call(2).data).toEqual({ clientId: BACKEND_APP.clientId, shortCode: 'two' });
      expect(created.clientSecret).toBe('Uc6Q~secret');
      expect(created.keys.map(key => key.subscriptionKey)).toEqual([
        'c5212ea63015c827b1a0f713fdbf42d6',
        'c5212ea63015c827b1a0f713fdbf42d6',
      ]);
      expect(created.application).toMatchObject({ id: BACKEND_APP.clientId, accessGranted: false });
      expect(created.application.apis.map(api => api.subscriptionName)).toEqual([
        'amp-user001-case-viewer-one',
        'amp-user001-case-viewer-one',
      ]);
      expect(created.failedApis).toEqual([]);
    });

    test('the_product_and_subscription_name_should_be_taken_from_the_backends_reply', async () => {
      answer({
        'POST /applications': () => ok({ ...BACKEND_APP, clientSecret: 's' }),
        'POST /apim/subscription-keys': () =>
          ok({
            title: 'Court Schedule',
            productId: 'try-it-now-cp-crime-schedulingandlisting',
            subscriptionName: 'amp-user001-case-viewer-one',
            subscriptionKey: 'k',
          }),
      });

      const created = await createApplication(OWNER, { name: 'Case Viewer', apis: ['api-one'] }, CATALOGUE);

      expect(created.application.apis[0]).toMatchObject({
        apiTitle: 'Court Schedule',
        publisherId: 'try-it-now-cp-crime-schedulingandlisting',
        subscriptionName: 'amp-user001-case-viewer-one',
      });
    });

    test('an_api_the_marketplace_does_not_offer_should_be_reported_without_being_called', async () => {
      answer({ 'POST /applications': () => ok({ ...BACKEND_APP, clientSecret: 's' }) });

      const created = await createApplication(OWNER, { name: 'Case Viewer', apis: ['api-three'] }, CATALOGUE);

      expect(request).toHaveBeenCalledTimes(1);
      expect(created.failedApis).toEqual(['api-three']);
    });

    test('an_api_that_cannot_be_subscribed_should_be_reported_without_losing_the_secret', async () => {
      answer({
        'POST /applications': () => ok({ ...BACKEND_APP, clientSecret: 'Uc6Q~secret' }),
        'POST /apim/subscription-keys': () => refused(502, 'APIM could not be reached.'),
      });

      const created = await createApplication(OWNER, { name: 'Case Viewer', apis: ['api-one'] }, CATALOGUE);

      expect(created.clientSecret).toBe('Uc6Q~secret');
      expect(created.failedApis).toEqual(['API one']);
      expect(created.application.apis).toEqual([]);
    });

    test('a_refusal_to_register_should_be_thrown_with_the_backends_status_and_message', async () => {
      answer({ 'POST /applications': () => refused(409, 'You already have an application called Case Viewer.') });

      await expect(
        createApplication(OWNER, { name: 'Case Viewer', apis: ['api-one'] }, CATALOGUE)
      ).rejects.toMatchObject({
        status: 409,
        message: 'You already have an application called Case Viewer.',
      });
    });

    test('an_unreachable_backend_should_throw_with_no_status', async () => {
      request.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const error = (await createApplication(OWNER, { name: 'Case Viewer', apis: ['api-one'] }, CATALOGUE).catch(
        e => e
      )) as BackendError;

      expect(error).toBeInstanceOf(BackendError);
      expect(error.status).toBeUndefined();
      expect(error.message).toContain('ECONNREFUSED');
    });
  });

  describe('reading', () => {
    test('the_list_should_carry_the_apis_kept_for_each_application', async () => {
      answer({
        'POST /applications': () => ok({ ...BACKEND_APP, clientSecret: 's' }),
        'POST /apim/subscription-keys': () => ok({ primaryKey: 'k' }),
        'GET /applications': () => ok([BACKEND_APP]),
      });
      await createApplication(OWNER, { name: 'Case Viewer', apis: ['api-one'] }, CATALOGUE);

      const [listed] = await listApplications(OWNER);

      expect(listed).toMatchObject({ id: BACKEND_APP.clientId, name: 'Case Viewer', secretHint: 'Uc6' });
      expect(listed.apis.map(api => api.apiName)).toEqual(['api-one']);
    });

    test('the_tenant_should_come_from_the_backend_and_be_empty_while_it_sends_none', async () => {
      const { tenantId, ...withoutTenant } = BACKEND_APP;
      answer({ 'GET /applications': () => ok([BACKEND_APP, { ...withoutTenant, clientId: 'other' }]) });

      const listed = await listApplications(OWNER);

      expect(listed.map(application => application.tenantId)).toEqual([tenantId, '']);
    });

    test('an_application_that_is_not_the_callers_should_be_undefined', async () => {
      answer({ 'GET /applications/*': () => refused(404, 'No application with client id x.') });

      await expect(getApplication(OWNER, 'x')).resolves.toBeUndefined();
    });

    test('a_caller_the_backend_does_not_know_should_be_told_to_sign_in_again', async () => {
      answer({ 'GET /applications/*': () => refused(404, 'Sign in again.') });

      const error = (await getApplication(OWNER, 'x').catch(e => e)) as BackendError;

      expect(error.signInAgain).toBe(true);
    });

    test('the_client_id_should_be_escaped_into_the_path', async () => {
      answer({ 'GET /applications/*': () => ok(BACKEND_APP) });

      await getApplication(OWNER, '../users');

      expect(call(0).url).toBe('/applications/..%2Fusers');
    });

    test('a_subscription_key_should_be_read_from_apim_on_demand', async () => {
      answer({ 'GET /apim/subscription-keys/amp-temp-1/values': () => ok({ primaryKey: 'abc' }) });

      await expect(
        subscriptionKey(OWNER, { subscriptionName: 'amp-temp-1' } as Application['apis'][number])
      ).resolves.toBe('abc');
    });
  });

  describe('granting access', () => {
    const application = (): Application => ({
      id: BACKEND_APP.clientId,
      clientId: BACKEND_APP.clientId,
      tenantId: BACKEND_APP.tenantId,
      name: 'Case Viewer',
      secretHint: 'Uc6',
      secretExpiresAt: '',
      createdAt: '',
      apis: [],
      accessGranted: false,
    });

    test('a_granted_role_should_be_remembered', async () => {
      answer({
        [`POST /applications/${BACKEND_APP.clientId}/roles`]: () => ok(),
        'GET /applications/*': () => ok(BACKEND_APP),
      });

      await expect(grantAccess(OWNER, application())).resolves.toEqual({ state: 'granted' });

      expect(call(0).data).toEqual({ role: APPLICATION_ROLE });
      expect((await getApplication(OWNER, BACKEND_APP.clientId))?.accessGranted).toBe(true);
    });

    test('a_principal_not_assignable_yet_should_be_pending', async () => {
      answer({ 'POST /applications/*': () => refused(404, 'No service principal yet.') });

      await expect(grantAccess(OWNER, application())).resolves.toEqual({ state: 'pending' });
    });

    test.each([400, 500])('a_%i_should_fail_with_the_backends_message', async status => {
      answer({ 'POST /applications/*': () => refused(status, 'Graph refused.') });

      await expect(grantAccess(OWNER, application())).resolves.toEqual({ state: 'failed', message: 'Graph refused.' });
    });

    test('an_application_already_granted_should_not_be_asked_again', async () => {
      await expect(grantAccess(OWNER, { ...application(), accessGranted: true })).resolves.toEqual({
        state: 'granted',
      });
      expect(request).not.toHaveBeenCalled();
    });

    test('an_unreachable_backend_should_throw', async () => {
      request.mockRejectedValue(new Error('timeout'));

      await expect(grantAccess(OWNER, application())).rejects.toBeInstanceOf(BackendError);
    });
  });

  describe('changing and deleting', () => {
    async function created(): Promise<Application> {
      answer({
        'POST /applications': () => ok({ ...BACKEND_APP, clientSecret: 's' }),
        'POST /apim/subscription-keys': () => ok({ primaryKey: 'k' }),
      });
      return (await createApplication(OWNER, { name: 'Case Viewer', apis: ['api-one'] }, CATALOGUE)).application;
    }

    test('changing_apis_should_revoke_the_removed_and_subscribe_the_added', async () => {
      const application = await created();
      request.mockReset();
      answer({
        'DELETE /apim/subscription-keys/*': () => ok(),
        'POST /apim/subscription-keys': () => ok({ primaryKey: 'k2' }),
      });

      const changes = await setApis(OWNER, application, ['api-two'], CATALOGUE);

      expect(changes).toEqual({ added: ['api-two'], removed: ['api-one'], failed: [] });
      expect(call(0)).toMatchObject({
        method: 'DELETE',
        url: `/apim/subscription-keys/${application.apis[0].subscriptionName}`,
      });
    });

    test('a_change_that_fails_should_be_reported_and_the_rest_kept', async () => {
      const application = await created();
      request.mockReset();
      answer({ 'POST /apim/subscription-keys': () => refused(502) });

      const changes = await setApis(OWNER, application, ['api-one', 'api-two'], CATALOGUE);

      expect(changes).toEqual({ added: [], removed: [], failed: ['API two'] });
    });

    test('deleting_should_revoke_its_keys_then_the_registration_and_forget_it', async () => {
      const application = await created();
      request.mockReset();
      answer({
        'DELETE /apim/subscription-keys/*': () => refused(404),
        [`DELETE /applications/${BACKEND_APP.clientId}`]: () => ok(),
        'GET /applications/*': () => ok(BACKEND_APP),
      });

      await deleteApplication(OWNER, application);

      expect(request.mock.calls.map(([config]) => config.method)).toEqual(['DELETE', 'DELETE']);
      expect((await getApplication(OWNER, BACKEND_APP.clientId))?.apis).toEqual([]);
    });

    test('a_key_that_cannot_be_revoked_should_stop_the_delete', async () => {
      const application = await created();
      request.mockReset();
      answer({ 'DELETE /apim/subscription-keys/*': () => refused(502) });

      await expect(deleteApplication(OWNER, application)).rejects.toMatchObject({ status: 502 });
      expect(request).toHaveBeenCalledTimes(1);
    });
  });
});
