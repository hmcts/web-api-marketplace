import { entraConfig } from '../../../main/modules/entra/config';
import { prepareEntra } from '../../../main/modules/entra/startup';
import { withCleanEnv } from '../helpers/env';

const SETTINGS = [
  'ENTRA_ENABLED',
  'ENTRA_CLIENT_ID',
  'ENTRA_CLIENT_SECRET',
  'ENTRA_TENANT_ID',
  'ENTRA_AUTHORIZE_ENDPOINT',
  'ENTRA_TOKEN_ENDPOINT',
  'ENTRA_REDIRECT_URI',
  'ENTRA_POST_LOGOUT_REDIRECT_URI',
  'ENTRA_KEY_VAULT',
  'ENTRA_KEY_VAULT_SECRET',
];

/** A vault that fails the test if anything asks it for a secret. */
const untouchableVault = () => ({
  getSecret: () => Promise.reject(new Error('the vault should not have been read')),
});

describe('entraConfig.enabled', () => {
  withCleanEnv(SETTINGS);

  test('sign_in_should_be_on_unless_switched_off', () => {
    expect(entraConfig.enabled).toBe(true);
  });

  test('ENTRA_ENABLED_false_should_switch_it_off', () => {
    process.env.ENTRA_ENABLED = 'false';

    expect(entraConfig.enabled).toBe(false);
  });

  test.each(['true', 'no', '0', 'FALSE', ''])('ENTRA_ENABLED_%p_should_leave_it_on', value => {
    process.env.ENTRA_ENABLED = value;

    expect(entraConfig.enabled).toBe(true);
  });
});

describe('prepareEntra', () => {
  withCleanEnv(SETTINGS);

  test('switched_off_it_should_start_with_no_entra_settings_and_not_touch_a_vault', async () => {
    process.env.ENTRA_ENABLED = 'false';
    process.env.ENTRA_KEY_VAULT = 'some-vault';
    process.env.ENTRA_KEY_VAULT_SECRET = 'some-secret';

    await expect(prepareEntra(untouchableVault)).resolves.toMatch(/switched off/);
  });

  test('switched_on_with_no_entra_settings_it_should_still_refuse_to_start', async () => {
    await expect(prepareEntra(untouchableVault)).rejects.toThrow(/ENTRA_CLIENT_SECRET/);
  });

  test('switched_on_and_configured_it_should_say_where_the_secret_came_from', async () => {
    process.env.ENTRA_CLIENT_ID = 'the-client-id';
    process.env.ENTRA_CLIENT_SECRET = 'the~secret';
    process.env.ENTRA_TENANT_ID = 'the-tenant';
    process.env.ENTRA_REDIRECT_URI = 'https://web.example/auth/callback';
    process.env.ENTRA_POST_LOGOUT_REDIRECT_URI = 'https://web.example/';

    await expect(prepareEntra(untouchableVault)).resolves.toBe('Entra client secret from environment');
  });
});
