import path from 'path';

import { MatchersV3, PactV4 } from '@pact-foundation/pact';

import {
  Application,
  Owner,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  subscriptionKey,
} from '../../main/services/Applications';
import { saveEntraUser } from '../../main/services/EntraUsers';
import { listProductionRequests, submitProductionRequest } from '../../main/services/ProductionRequests';

const { eachLike, fromProviderState, integer, string, uuid } = MatchersV3;

const OBJECT_ID = '44444444-4444-4444-8444-444444444444';
const OWNER: Owner = { oid: OBJECT_ID, userReference: 'user001' };
const APP_NAME = 'Pact Test App';
const EXAMPLE_CLIENT_ID = '55555555-5555-4555-8555-555555555555';
const EXAMPLE_SUBSCRIPTION = 'amp-user001-pact-test-app-slc';
const AS_USER = { requestingUserId: OBJECT_ID };

const SIGNED_IN = 'a signed-in user';
const WITH_APPLICATION = 'a signed-in user with an application';
const WITH_PRODUCTION_REQUEST = 'a signed-in user with a production request';
const WITH_SUBSCRIPTION = 'a signed-in user with an application subscribed to an API';

const pact = new PactV4({
  consumer: 'amp_web_api_marketplace',
  provider: 'amp_service_api_marketplace',
  dir: path.resolve(process.cwd(), 'pact/pacts'),
  logLevel: 'warn',
});

const application = (overrides: Partial<Application> = {}): Application => ({
  id: EXAMPLE_CLIENT_ID,
  clientId: EXAMPLE_CLIENT_ID,
  tenantId: '',
  name: APP_NAME,
  secretHint: '',
  secretExpiresAt: '',
  createdAt: '',
  apis: [],
  accessGranted: false,
  ...overrides,
});

const applicationBody = {
  clientId: uuid(EXAMPLE_CLIENT_ID),
  tenantId: string('00000000-0000-4000-8000-00000000c1a0'),
  name: string(APP_NAME),
  secretHint: string('abc'),
  secretExpiresAt: string('2027-10-30T12:00:00'),
  createdAt: string('2026-10-30T12:00:00'),
};

describe('Pact with service-api-marketplace', () => {
  beforeEach(() => {
    delete process.env.API_URL;
  });

  test('saving the signed-in user', () =>
    pact
      .addInteraction()
      .uponReceiving('the user Entra has just signed in')
      .withRequest('POST', '/session', builder =>
        builder.jsonBody({ objectId: OBJECT_ID, email: 'pact@amp.example.com', name: 'Pact Test' })
      )
      .willRespondWith(200, builder => builder.jsonBody({ id: integer(1), userReference: string('user001') }))
      .executeTest(async server => {
        process.env.API_URL = server.url;
        const user = await saveEntraUser({ oid: OBJECT_ID, email: 'pact@amp.example.com', name: 'Pact Test' });
        expect(user.userReference).toBe('user001');
      }));

  test('listing the applications', () =>
    pact
      .addInteraction()
      .given(WITH_APPLICATION, { objectId: OBJECT_ID, name: APP_NAME })
      .uponReceiving("a request for the user's applications")
      .withRequest('GET', '/applications', builder => builder.headers(AS_USER))
      .willRespondWith(200, builder => builder.jsonBody(eachLike(applicationBody)))
      .executeTest(async server => {
        process.env.API_URL = server.url;
        const applications = await listApplications(OWNER);
        expect(applications[0].name).toBe(APP_NAME);
      }));

  test('reading an application', () =>
    pact
      .addInteraction()
      .given(WITH_APPLICATION, { objectId: OBJECT_ID, name: APP_NAME })
      .uponReceiving('a request for one of the user’s applications')
      .withRequest(
        'GET',
        fromProviderState('/applications/${clientId}', `/applications/${EXAMPLE_CLIENT_ID}`),
        builder => builder.headers(AS_USER)
      )
      .willRespondWith(200, builder => builder.jsonBody(applicationBody))
      .executeTest(async server => {
        process.env.API_URL = server.url;
        const found = await getApplication(OWNER, EXAMPLE_CLIENT_ID);
        expect(found?.clientId).toBe(EXAMPLE_CLIENT_ID);
      }));

  test('registering an application', () =>
    pact
      .addInteraction()
      .given(SIGNED_IN, { objectId: OBJECT_ID })
      .uponReceiving('a request to register an application')
      .withRequest('POST', '/applications', builder => builder.headers(AS_USER).jsonBody({ name: APP_NAME }))
      .willRespondWith(201, builder =>
        builder.jsonBody({ clientId: uuid(EXAMPLE_CLIENT_ID), name: string(APP_NAME), clientSecret: string('s3cret') })
      )
      .executeTest(async server => {
        process.env.API_URL = server.url;
        const created = await createApplication(OWNER, { name: APP_NAME, apis: [] }, []);
        expect(created.clientSecret).toBe('s3cret');
      }));

  test('deleting an application', () =>
    pact
      .addInteraction()
      .given(WITH_APPLICATION, { objectId: OBJECT_ID, name: APP_NAME })
      .uponReceiving('a request to delete one of the user’s applications')
      .withRequest(
        'DELETE',
        fromProviderState('/applications/${clientId}', `/applications/${EXAMPLE_CLIENT_ID}`),
        builder => builder.headers(AS_USER)
      )
      .willRespondWith(204)
      .executeTest(async server => {
        process.env.API_URL = server.url;
        await expect(deleteApplication(OWNER, application())).resolves.toBeUndefined();
      }));

  test('reading a subscription key', () =>
    pact
      .addInteraction()
      .given(WITH_SUBSCRIPTION, { objectId: OBJECT_ID, name: APP_NAME, shortCode: 'slc' })
      .uponReceiving('a request for the values of one of the user’s subscription keys')
      .withRequest(
        'GET',
        fromProviderState(
          '/apim/subscription-keys/${subscriptionName}/values',
          `/apim/subscription-keys/${EXAMPLE_SUBSCRIPTION}/values`
        ),
        builder => builder.headers(AS_USER)
      )
      .willRespondWith(200, builder => builder.jsonBody({ primaryKey: string('primary-key') }))
      .executeTest(async server => {
        process.env.API_URL = server.url;
        const key = await subscriptionKey(OWNER, {
          apiName: 'api-cp-crime-schedulingandlisting-courtschedule',
          apiTitle: 'Court schedule',
          publisherId: 'slc',
          subscriptionName: EXAMPLE_SUBSCRIPTION,
          subscribedAt: '',
        });
        expect(key).toBe('primary-key');
      }));

  test('listing the production requests', () =>
    pact
      .addInteraction()
      .given(WITH_PRODUCTION_REQUEST, { objectId: OBJECT_ID, name: APP_NAME })
      .uponReceiving("a request for the user's production requests")
      .withRequest('GET', '/production-requests', builder => builder.headers(AS_USER))
      .willRespondWith(200, builder =>
        builder.jsonBody(
          eachLike({
            reference: string('PCR-ABCD2345'),
            status: string('SUBMITTED'),
            submittedAt: string('2026-10-30T12:00:00'),
            applicationName: string(APP_NAME),
          })
        )
      )
      .executeTest(async server => {
        process.env.API_URL = server.url;
        const requests = await listProductionRequests(OWNER);
        expect(requests[0].reference).toBe('PCR-ABCD2345');
      }));

  test('submitting a production request', () =>
    pact
      .addInteraction()
      .given(WITH_APPLICATION, { objectId: OBJECT_ID, name: APP_NAME })
      .uponReceiving('a production request for one of the user’s applications')
      .withRequest('POST', '/production-requests', builder =>
        builder.headers(AS_USER).jsonBody({
          clientId: fromProviderState('${clientId}', EXAMPLE_CLIENT_ID),
          organisation: 'Pact Test Ltd',
          goLiveDate: '2027-03-27',
          callVolume: 'low',
          dataRequest: 'Court schedules for a contract test.',
          proposedOutputs: 'None: this request is made by a contract test.',
        })
      )
      .willRespondWith(201, builder =>
        builder.jsonBody({
          reference: string('PCR-ABCD2345'),
          status: string('SUBMITTED'),
          submittedAt: string('2026-10-30T12:00:00'),
        })
      )
      .executeTest(async server => {
        process.env.API_URL = server.url;
        const submitted = await submitProductionRequest(OWNER, {
          clientId: EXAMPLE_CLIENT_ID,
          organisation: 'Pact Test Ltd',
          goLiveDate: '2027-03-27',
          callVolume: 'low',
          dataRequest: 'Court schedules for a contract test.',
          proposedOutputs: 'None: this request is made by a contract test.',
        });
        expect(submitted.reference).toBe('PCR-ABCD2345');
      }));
});
