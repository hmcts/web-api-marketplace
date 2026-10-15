import axios from 'axios';

import { saveEntraUser } from '../../../main/services/EntraUsers';

jest.mock('axios');

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

const OID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const saved = {
  id: 42,
  userReference: 'user042',
  entraObjectId: OID,
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  status: 'ACTIVE',
  createdAt: '2026-10-15T09:00:00',
  lastLoginAt: '2026-10-15T09:00:00',
};

describe('saveEntraUser', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedPost.mockResolvedValue({ status: 200, data: saved });
  });

  test('should_post_the_oid_email_and_name_to_the_session_endpoint', async () => {
    await saveEntraUser({ oid: OID, email: ' Ada@Example.com ', name: ' Ada Lovelace ' });

    const [url, body] = mockedPost.mock.calls[0];
    expect(url).toBe('http://localhost:8080/session');
    expect(body).toEqual({ objectId: OID, email: 'ada@example.com', name: 'Ada Lovelace' });
  });

  test('should_return_the_user_the_backend_holds', async () => {
    expect(await saveEntraUser({ oid: OID, email: 'ada@example.com', name: 'Ada Lovelace' })).toEqual(saved);
  });

  test('a_missing_name_should_be_sent_as_empty', async () => {
    await saveEntraUser({ oid: OID, email: 'ada@example.com' });

    expect(mockedPost.mock.calls[0][1]).toMatchObject({ name: '' });
  });

  test('the_name_should_be_cut_to_what_the_backend_accepts_rather_than_block_sign_in', async () => {
    await saveEntraUser({ oid: OID, email: 'ada@example.com', name: 'A'.repeat(250) });

    expect((mockedPost.mock.calls[0][1] as { name: string }).name).toHaveLength(200);
  });

  test('API_URL_should_be_read_on_each_call', async () => {
    const apiUrl = process.env.API_URL;
    process.env.API_URL = 'http://backend.example';
    try {
      await saveEntraUser({ oid: OID, email: 'ada@example.com' });
    } finally {
      if (apiUrl === undefined) {
        delete process.env.API_URL;
      } else {
        process.env.API_URL = apiUrl;
      }
    }

    expect(mockedPost.mock.calls[0][0]).toBe('http://backend.example/session');
  });

  test('a_refusal_should_reject_naming_the_status', async () => {
    mockedPost.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 409 } }));

    await expect(saveEntraUser({ oid: OID, email: 'ada@example.com' })).rejects.toThrow(/409/);
  });

  test('an_unreachable_backend_should_reject', async () => {
    mockedPost.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(saveEntraUser({ oid: OID, email: 'ada@example.com' })).rejects.toThrow(/ECONNREFUSED/);
  });
});
