import express from 'express';

import { Session } from '../../../main/modules/session';

jest.mock('redis', () => ({ createClient: jest.fn() }));
jest.mock('connect-redis', () => ({
  RedisStore: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');

const withRedis = { host: 'apim.redis.cache.windows.net', port: '6380', key: 'a-key', tls: true };
const withoutRedis = { host: '', port: '6380', key: '', tls: true };

const fakeClient = () => ({ on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined) });

describe('Session', () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReset().mockReturnValue(fakeClient());
    (RedisStore as jest.Mock).mockClear();
  });

  const enable = (redis: typeof withRedis) =>
    new Session({ secret: 'a-secret', maxAgeMinutes: 20, redis }).enableFor(express());

  test('a_configured_host_should_put_sessions_in_redis', () => {
    enable(withRedis);

    expect(RedisStore).toHaveBeenCalled();
  });

  test('no_host_should_fall_back_to_this_process_so_local_development_needs_no_redis', () => {
    enable(withoutRedis);

    expect(createClient).not.toHaveBeenCalled();
    expect(RedisStore).not.toHaveBeenCalled();
  });

  test('azure_redis_should_be_reached_over_tls_with_the_access_key', () => {
    enable(withRedis);

    const options = (createClient as jest.Mock).mock.calls[0][0];
    expect(options.url).toBe('rediss://apim.redis.cache.windows.net:6380');
    expect(options.password).toBe('a-key');
    expect(options.socket.tls).toBe(true);
    expect(options.socket.servername).toBe('apim.redis.cache.windows.net');
  });

  test('tls_should_be_optional_so_a_local_redis_can_be_used', () => {
    enable({ host: '127.0.0.1', port: '6379', key: '', tls: false });

    const options = (createClient as jest.Mock).mock.calls[0][0];
    expect(options.url).toBe('redis://127.0.0.1:6379');
    expect(options.socket.tls).toBeUndefined();
  });

  test('sessions_should_be_namespaced_so_the_cache_can_be_shared', () => {
    enable(withRedis);

    expect((RedisStore as jest.Mock).mock.calls[0][0].prefix).toBe('apim-marketplace-web:');
  });
});
