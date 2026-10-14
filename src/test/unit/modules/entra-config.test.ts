import { assertEntraConfigured, entraConfig } from '../../../main/modules/entra/config';

/**
 * In AKS the vault mount gives the tenant ID rather than the endpoints, so the endpoints are
 * the tenant's own: External ID publishes them, and its issuer, under
 * https://<tenant-id>.ciamlogin.com/<tenant-id>/.
 */
const SETTINGS = [
  'ENTRA_CLIENT_ID',
  'ENTRA_CLIENT_SECRET',
  'ENTRA_TENANT_ID',
  'ENTRA_AUTHORIZE_ENDPOINT',
  'ENTRA_TOKEN_ENDPOINT',
  'ENTRA_DISCOVERY_ENDPOINT',
  'ENTRA_REDIRECT_URI',
  'ENTRA_POST_LOGOUT_REDIRECT_URI',
];

describe('entraConfig', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    SETTINGS.forEach(name => {
      saved[name] = process.env[name];
      delete process.env[name];
    });
  });

  afterEach(() => {
    SETTINGS.forEach(name => {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    });
  });

  test('with_only_a_tenant_id_the_endpoints_should_be_the_tenants_own', () => {
    process.env.ENTRA_TENANT_ID = 'the-tenant';

    expect(entraConfig.authorizeEndpoint).toBe('https://the-tenant.ciamlogin.com/the-tenant/oauth2/v2.0/authorize');
    expect(entraConfig.tokenEndpoint).toBe('https://the-tenant.ciamlogin.com/the-tenant/oauth2/v2.0/token');
    expect(entraConfig.discoveryEndpoint).toBe(
      'https://the-tenant.ciamlogin.com/the-tenant/v2.0/.well-known/openid-configuration'
    );
  });

  test('endpoints_given_explicitly_should_win_over_the_tenant_id', () => {
    process.env.ENTRA_TENANT_ID = 'the-tenant';
    process.env.ENTRA_AUTHORIZE_ENDPOINT = 'https://login.example/authorize';
    process.env.ENTRA_TOKEN_ENDPOINT = 'https://login.example/oauth2/v2.0/token';

    expect(entraConfig.authorizeEndpoint).toBe('https://login.example/authorize');
    expect(entraConfig.tokenEndpoint).toBe('https://login.example/oauth2/v2.0/token');
  });

  test('a_deployment_given_the_vault_mounts_settings_should_start', () => {
    process.env.ENTRA_CLIENT_ID = 'the-client-id';
    process.env.ENTRA_CLIENT_SECRET = 'the~secret';
    process.env.ENTRA_TENANT_ID = 'the-tenant';
    process.env.ENTRA_REDIRECT_URI = 'https://web.example/auth/callback';
    process.env.ENTRA_POST_LOGOUT_REDIRECT_URI = 'https://web.example/';

    expect(() => assertEntraConfigured()).not.toThrow();
  });

  test('with_neither_endpoints_nor_a_tenant_id_the_message_should_say_the_tenant_id_is_enough', () => {
    process.env.ENTRA_CLIENT_ID = 'the-client-id';
    process.env.ENTRA_CLIENT_SECRET = 'the~secret';
    process.env.ENTRA_REDIRECT_URI = 'https://web.example/auth/callback';
    process.env.ENTRA_POST_LOGOUT_REDIRECT_URI = 'https://web.example/';

    expect(() => assertEntraConfigured()).toThrow(/ENTRA_TENANT_ID/);
  });
});
