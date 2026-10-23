import config from 'config';
import express from 'express';
import { get } from 'lodash';

jest.mock('@hmcts/properties-volume', () => ({ addTo: jest.fn() }));
jest.mock('config', () => {
  const lodash = jest.requireActual('lodash');
  const store: Record<string, unknown> = {
    has: (path: string) => lodash.get(store, path) !== undefined,
  };
  return { __esModule: true, default: store };
});

import { PropertiesVolume } from '../../../main/modules/properties-volume';

const store = config as unknown as Record<string, unknown>;

const mounted = (vault: string) => ({
  [vault]: {
    REDIS_HOST: 'apim.redis.cache.windows.net',
    REDIS_PORT: '6380',
    REDIS_KEY: 'a-key',
    SESSION_SECRET: 'a-shared-secret',
  },
});

const enable = (env: string) => {
  const server = express();
  server.locals.ENV = env;
  new PropertiesVolume().enableFor(server);
};

describe('PropertiesVolume', () => {
  beforeEach(() => {
    delete store.secrets;
    store.session = { secret: '', redis: { host: '', port: '6380', key: '', tls: true } };
  });

  test('secrets_mounted_from_the_sandbox_vault_should_reach_the_session_config', () => {
    store.secrets = mounted('amp-sbox');

    enable('sandbox');

    expect(get(store, 'session.redis.host')).toBe('apim.redis.cache.windows.net');
    expect(get(store, 'session.redis.port')).toBe('6380');
    expect(get(store, 'session.redis.key')).toBe('a-key');
    expect(get(store, 'session.secret')).toBe('a-shared-secret');
  });

  test('secrets_mounted_from_the_shared_vault_should_reach_the_session_config', () => {
    store.secrets = mounted('amp');

    enable('aat');

    expect(get(store, 'session.redis.host')).toBe('apim.redis.cache.windows.net');
    expect(get(store, 'session.secret')).toBe('a-shared-secret');
  });

  test('no_mounted_secrets_should_leave_the_session_config_alone', () => {
    enable('sandbox');

    expect(get(store, 'session.redis.host')).toBe('');
    expect(get(store, 'session.secret')).toBe('');
  });

  test('running_in_development_should_not_read_any_volume', () => {
    store.secrets = mounted('amp-sbox');

    enable('development');

    expect(get(store, 'session.redis.host')).toBe('');
  });

  test('a_sandbox_vault_should_win_over_an_empty_shared_vault', () => {
    store.secrets = { amp: {}, 'amp-sbox': mounted('amp-sbox')['amp-sbox'] };

    enable('sandbox');

    expect(get(store, 'session.redis.host')).toBe('apim.redis.cache.windows.net');
  });

  test.each(['kvspsextidsbox', 'kv-entra-stg', 'kv-entra-prod'])(
    'entra_credentials_mounted_from_the_external_tenants_vault_%s_should_reach_the_entra_config',
    vault => {
      store.secrets = {
        [vault]: { ENTRA_CLIENT_ID: 'the-client-id', ENTRA_CLIENT_SECRET: 'the~secret', ENTRA_TENANT_ID: 'the-tenant' },
      };

      enable('sandbox');

      expect(get(store, 'entra.clientId')).toBe('the-client-id');
      expect(get(store, 'entra.clientSecret')).toBe('the~secret');
      expect(get(store, 'entra.tenantId')).toBe('the-tenant');
    }
  );
});
