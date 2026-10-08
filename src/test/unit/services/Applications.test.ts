import { MemoryStore, useDataStore } from '../../../main/modules/store';
import {
  createApplication,
  deleteApplication,
  getApplication,
  regenerateSecret,
  setApis,
  validateApis,
  validateDetails,
} from '../../../main/services/Applications';

const catalogue = [
  { name: 'api-one', title: 'API one' },
  { name: 'api-two', title: 'API two' },
];
const draft = { environment: 'sandbox', name: 'Tracker', description: '', apis: ['api-one'] };

describe('Applications', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('creating_should_issue_credentials_and_store_only_the_secret_hint', async () => {
    const { application, clientSecret } = await createApplication('ada@example.com', draft, catalogue);
    const stored = await getApplication('ada@example.com', application.id);

    expect(stored?.apis).toHaveLength(1);
    expect(stored?.apis[0]).toMatchObject({ apiName: 'api-one', apiTitle: 'API one', publisherId: 'one' });
    expect(JSON.stringify(stored)).not.toContain(clientSecret);
    expect(stored?.secretHint).toBe(clientSecret.slice(0, 3));
  });

  test('another_owner_should_not_find_the_application', async () => {
    const { application } = await createApplication('ada@example.com', draft, catalogue);

    expect(await getApplication('charles@example.com', application.id)).toBeUndefined();
    expect(await deleteApplication('charles@example.com', application.id)).toBeUndefined();
    expect(await getApplication('ada@example.com', application.id)).toBeDefined();
  });

  test('setting_apis_should_keep_existing_keys_and_issue_new_ones', async () => {
    const { application } = await createApplication('ada@example.com', draft, catalogue);
    const keptKey = application.apis[0].subscriptionKey;

    expect(await setApis('ada@example.com', application.id, ['api-one', 'api-two'], catalogue)).toEqual({
      added: ['api-two'],
      removed: [],
    });
    const updated = await getApplication('ada@example.com', application.id);
    expect(updated?.apis.find(api => api.apiName === 'api-one')?.subscriptionKey).toBe(keptKey);
    expect(updated?.apis).toHaveLength(2);
  });

  test('regenerating_should_replace_the_secret', async () => {
    const { application, clientSecret } = await createApplication('ada@example.com', draft, catalogue);
    const next = (await regenerateSecret('ada@example.com', application.id)) as string;

    expect(next).not.toBe(clientSecret);
    expect((await getApplication('ada@example.com', application.id))?.secretHint).toBe(next.slice(0, 3));
  });

  test('details_should_need_a_name_the_user_has_not_already_used', async () => {
    await createApplication('ada@example.com', draft, catalogue);

    expect((await validateDetails('ada@example.com', {})).map(error => error.name)).toEqual(['name']);
    expect(await validateDetails('ada@example.com', { environment: 'sandbox', name: 'tracker' })).toEqual([
      { name: 'name', text: 'You already have an application with this name' },
    ]);
    expect(await validateDetails('ada@example.com', { environment: 'sandbox', name: 'New' })).toEqual([]);
  });

  test('apis_should_be_at_least_one_from_the_catalogue', () => {
    expect(validateApis([], catalogue)).toHaveLength(1);
    expect(validateApis(['not-in-catalogue'], catalogue)).toHaveLength(1);
    expect(validateApis(['api-two'], catalogue)).toEqual([]);
  });
});
