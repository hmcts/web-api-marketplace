import { MemoryStore, RedisStore } from '../../../main/modules/store';

describe('MemoryStore', () => {
  test('a_document_should_come_back_as_it_was_stored', async () => {
    const store = new MemoryStore();
    await store.set('a', { b: [1, 2] });

    expect(await store.get('a')).toEqual({ b: [1, 2] });
  });

  test('changing_what_was_read_should_not_change_what_is_stored', async () => {
    const store = new MemoryStore();
    await store.set('a', { b: 1 });
    const read = await store.get<{ b: number }>('a');
    (read as { b: number }).b = 2;

    expect(await store.get('a')).toEqual({ b: 1 });
  });

  test('an_expired_document_should_be_gone', async () => {
    jest.useFakeTimers();
    try {
      const store = new MemoryStore();
      await store.set('token', 'x', 60);
      jest.advanceTimersByTime(61_000);

      expect(await store.get('token')).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a_deleted_document_should_be_gone', async () => {
    const store = new MemoryStore();
    await store.set('a', 1);
    await store.delete('a');

    expect(await store.get('a')).toBeUndefined();
  });
});

describe('RedisStore', () => {
  test('documents_should_be_prefixed_json_and_expire_when_asked', async () => {
    const client = { get: jest.fn().mockResolvedValue('{"b":1}'), set: jest.fn(), del: jest.fn() };
    const store = new RedisStore(client, 'p:');

    await store.set('a', { b: 1 }, 30);
    expect(client.set).toHaveBeenCalledWith('p:a', '{"b":1}', { EX: 30 });
    expect(await store.get('a')).toEqual({ b: 1 });

    await store.delete('a');
    expect(client.del).toHaveBeenCalledWith('p:a');
  });

  test('a_missing_key_should_read_as_undefined', async () => {
    const store = new RedisStore({ get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() });

    expect(await store.get('missing')).toBeUndefined();
  });
});
