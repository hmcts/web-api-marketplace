import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { getCatalogueApis } from '../../../main/services/ApiCatalogue';
import {
  createApplication,
  deleteApplication,
  getApplication,
  regenerateSecret,
  setApis,
  validateApis,
  validateDetails,
} from '../../../main/services/Applications';
import {
  ApplicationsUnavailableError,
  fetchApplications,
  registerApplication,
} from '../../../main/services/BackendApplications';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
}));
jest.mock('../../../main/services/BackendApplications', () => ({
  ...jest.requireActual('../../../main/services/BackendApplications'),
  fetchApplications: jest.fn(),
  registerApplication: jest.fn(),
}));

const mockedFetch = fetchApplications as jest.MockedFunction<typeof fetchApplications>;
const mockedRegister = registerApplication as jest.MockedFunction<typeof registerApplication>;

const catalogue = [
  { name: 'api-one', title: 'API one' },
  { name: 'api-two', title: 'API two' },
];
const ADA = { id: 0, local: true, email: 'ada@example.com' };
const CHARLES = { id: 0, local: true, email: 'charles@example.com' };
const draft = { environment: 'sandbox', name: 'Tracker', description: '', apis: ['api-one'] };

describe('Applications', () => {
  beforeEach(() => {
    useDataStore(new MemoryStore());
    mockedFetch.mockReset();
    mockedRegister.mockReset();
    (getCatalogueApis as jest.Mock).mockResolvedValue(catalogue);
  });

  test('creating_should_issue_credentials_and_store_only_the_secret_hint', async () => {
    const { application, clientSecret } = await createApplication(ADA, draft, catalogue);
    const stored = await getApplication(ADA, application.id);

    expect(stored?.apis).toHaveLength(1);
    expect(stored?.apis[0]).toMatchObject({ apiName: 'api-one', apiTitle: 'API one', publisherId: 'one' });
    expect(JSON.stringify(stored)).not.toContain(clientSecret);
    expect(stored?.secretHint).toBe(clientSecret.slice(0, 3));
  });

  test('another_owner_should_not_find_the_application', async () => {
    const { application } = await createApplication(ADA, draft, catalogue);

    expect(await getApplication(CHARLES, application.id)).toBeUndefined();
    expect(await deleteApplication(CHARLES, application.id)).toBeUndefined();
    expect(await getApplication(ADA, application.id)).toBeDefined();
  });

  test('setting_apis_should_keep_existing_keys_and_issue_new_ones', async () => {
    const { application } = await createApplication(ADA, draft, catalogue);
    const keptKey = application.apis[0].subscriptionKey;

    expect(await setApis(ADA, application.id, ['api-one', 'api-two'], catalogue)).toEqual({
      added: ['api-two'],
      removed: [],
    });
    const updated = await getApplication(ADA, application.id);
    expect(updated?.apis.find(api => api.apiName === 'api-one')?.subscriptionKey).toBe(keptKey);
    expect(updated?.apis).toHaveLength(2);
  });

  test('regenerating_should_replace_the_secret', async () => {
    const { application, clientSecret } = await createApplication(ADA, draft, catalogue);
    const next = (await regenerateSecret(ADA, application.id)) as string;

    expect(next).not.toBe(clientSecret);
    expect((await getApplication(ADA, application.id))?.secretHint).toBe(next.slice(0, 3));
  });

  test('details_should_need_a_name_the_user_has_not_already_used', async () => {
    await createApplication(ADA, draft, catalogue);

    expect((await validateDetails(ADA, {})).map(error => error.name)).toEqual(['name']);
    expect(await validateDetails(ADA, { environment: 'sandbox', name: 'tracker' })).toEqual([
      { name: 'name', text: 'You already have an application with this name' },
    ]);
    expect(await validateDetails(ADA, { environment: 'sandbox', name: 'New' })).toEqual([]);
  });

  test('apis_should_be_at_least_one_from_the_catalogue', () => {
    expect(validateApis([], catalogue)).toHaveLength(1);
    expect(validateApis(['not-in-catalogue'], catalogue)).toHaveLength(1);
    expect(validateApis(['api-two'], catalogue)).toEqual([]);
  });

  describe('for an account the backend knows', () => {
    const GRACE = { id: 7, local: false, email: 'grace@example.com' };
    const BACKEND_APPLICATION = {
      id: 12,
      name: 'Tracker',
      environment: 'sandbox',
      clientId: 'real-client-id',
      apiCredentials: [{ apiShortCode: 'api-one', publisherId: 'product-one', subscriptionKey: 'real-key' }],
    };

    test('creating_should_register_through_the_backend_and_keep_only_what_it_does_not', async () => {
      mockedRegister.mockResolvedValue({ ...BACKEND_APPLICATION, clientSecret: 'abc8Q~real-secret' });

      const { application, clientSecret } = await createApplication(
        GRACE,
        { ...draft, description: 'Tracks things' },
        catalogue
      );

      expect(mockedRegister).toHaveBeenCalledWith(7, {
        name: 'Tracker',
        environment: 'sandbox',
        apiShortCodes: ['api-one'],
      });
      expect(clientSecret).toBe('abc8Q~real-secret');
      expect(application).toMatchObject({
        id: '12',
        clientId: 'real-client-id',
        description: 'Tracks things',
        secretHint: 'abc',
        managedByBackend: true,
      });
      expect(application.apis[0]).toMatchObject({
        apiName: 'api-one',
        apiTitle: 'API one',
        publisherId: 'product-one',
        subscriptionKey: 'real-key',
      });
    });

    test('the_secret_should_never_be_stored', async () => {
      const store = new MemoryStore();
      useDataStore(store);
      mockedRegister.mockResolvedValue({ ...BACKEND_APPLICATION, clientSecret: 'abc8Q~real-secret' });

      await createApplication(GRACE, draft, catalogue);

      expect(JSON.stringify(await store.get('application-details:12'))).not.toContain('real-secret');
    });

    test('listing_should_merge_the_backend_list_with_what_was_kept_here', async () => {
      mockedRegister.mockResolvedValue({ ...BACKEND_APPLICATION, clientSecret: 'abc8Q~real-secret' });
      await createApplication(GRACE, { ...draft, description: 'Tracks things' }, catalogue);
      mockedFetch.mockResolvedValue([BACKEND_APPLICATION]);

      const found = await getApplication(GRACE, '12');

      expect(mockedFetch).toHaveBeenCalledWith(7);
      expect(found).toMatchObject({ description: 'Tracks things', secretHint: 'abc', managedByBackend: true });
    });

    test('an_application_registered_elsewhere_should_leave_the_extra_details_empty', async () => {
      mockedFetch.mockResolvedValue([BACKEND_APPLICATION]);

      expect(await getApplication(GRACE, '12')).toMatchObject({
        description: '',
        secretHint: '',
        secretExpiresAt: '',
        createdAt: '',
      });
    });

    test('a_failed_registration_should_store_nothing', async () => {
      const store = new MemoryStore();
      useDataStore(store);
      mockedRegister.mockRejectedValue(new ApplicationsUnavailableError('503'));

      await expect(createApplication(GRACE, draft, catalogue)).rejects.toBeInstanceOf(ApplicationsUnavailableError);
      expect(await store.get('application-details:12')).toBeUndefined();
    });

    test('a_name_already_in_the_backend_should_be_refused', async () => {
      mockedFetch.mockResolvedValue([BACKEND_APPLICATION]);

      expect(await validateDetails(GRACE, { environment: 'sandbox', name: 'tracker' })).toEqual([
        { name: 'name', text: 'You already have an application with this name' },
      ]);
    });

    test('changing_rotating_and_deleting_should_not_touch_a_backend_application', async () => {
      mockedFetch.mockResolvedValue([BACKEND_APPLICATION]);

      expect(await setApis(GRACE, '12', ['api-two'], catalogue)).toBeUndefined();
      expect(await regenerateSecret(GRACE, '12')).toBeUndefined();
      expect(await deleteApplication(GRACE, '12')).toBeUndefined();
    });
  });
});
