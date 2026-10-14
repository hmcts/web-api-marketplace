import { SecretClient } from '@azure/keyvault-secrets';

import { assertEntraConfigured } from '../../../main/modules/entra/config';
import { loadEntraClientSecret, secretClientFor, vaultUrlFor } from '../../../main/modules/entra/secret';

/** A key vault holding the given secrets, recording which vault and secret were asked for. */
const fakeVault = (secrets: Record<string, string>) => {
  const asked: { vaultUrl: string; name: string }[] = [];
  const factory = (vaultUrl: string) => ({
    getSecret: async (name: string) => {
      asked.push({ vaultUrl, name });
      if (!(name in secrets)) {
        throw new Error(`SecretNotFound: ${name}`);
      }
      return { name, value: secrets[name] };
    },
  });
  return { factory, asked };
};

const SETTINGS = ['ENTRA_CLIENT_SECRET', 'ENTRA_KEY_VAULT', 'ENTRA_KEY_VAULT_SECRET'];

describe('loadEntraClientSecret', () => {
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

  const useVault = () => {
    process.env.ENTRA_KEY_VAULT = 'kvdemo';
    process.env.ENTRA_KEY_VAULT_SECRET = 'entra-app-demo-secret';
  };

  test('a_secret_already_set_should_win_without_calling_the_key_vault', async () => {
    useVault();
    process.env.ENTRA_CLIENT_SECRET = 'exported~value';
    const vault = fakeVault({ 'entra-app-demo-secret': 'vault~value' });

    const source = await loadEntraClientSecret(vault.factory);

    expect(process.env.ENTRA_CLIENT_SECRET).toBe('exported~value');
    expect(source).toBe('environment');
    expect(vault.asked).toEqual([]);
  });

  test('with_no_secret_set_it_should_be_read_from_the_key_vault_named_in_the_environment', async () => {
    useVault();
    const vault = fakeVault({ 'entra-app-demo-secret': 'vault~value' });

    const source = await loadEntraClientSecret(vault.factory);

    expect(process.env.ENTRA_CLIENT_SECRET).toBe('vault~value');
    expect(vault.asked).toEqual([{ vaultUrl: vaultUrlFor('kvdemo'), name: 'entra-app-demo-secret' }]);
    expect(source).toBe('Key Vault kvdemo/entra-app-demo-secret');
  });

  test('the_vault_address_should_be_the_named_vault_over_https', () => {
    const url = new URL(vaultUrlFor('kvdemo'));

    expect(url.protocol).toBe('https:');
    expect(url.hostname.split('.')[0]).toBe('kvdemo');
    expect(url.hostname.endsWith('.azure.net')).toBe(true);
  });

  test('with_no_secret_and_no_vault_it_should_be_left_unset_for_assertEntraConfigured_to_report', async () => {
    const vault = fakeVault({});

    const source = await loadEntraClientSecret(vault.factory);

    expect(process.env.ENTRA_CLIENT_SECRET).toBeUndefined();
    expect(source).toBeUndefined();
    expect(vault.asked).toEqual([]);
  });

  test('a_key_vault_failure_should_name_the_vault_and_secret_and_say_how_to_fix_it', async () => {
    useVault();
    const vault = fakeVault({});

    const failure = loadEntraClientSecret(vault.factory);

    await expect(failure).rejects.toThrow(/kvdemo\/entra-app-demo-secret/);
    await expect(loadEntraClientSecret(vault.factory)).rejects.toThrow(/az login/);
    await expect(loadEntraClientSecret(vault.factory)).rejects.toThrow(/SecretNotFound/);
    expect(process.env.ENTRA_CLIENT_SECRET).toBeUndefined();
  });

  test('an_empty_secret_in_the_key_vault_should_be_refused', async () => {
    useVault();
    const vault = fakeVault({ 'entra-app-demo-secret': '' });

    await expect(loadEntraClientSecret(vault.factory)).rejects.toThrow(/empty/);
    expect(process.env.ENTRA_CLIENT_SECRET).toBeUndefined();
  });

  test('the_real_client_should_be_a_key_vault_secret_client_for_that_vault', () => {
    const client = secretClientFor(vaultUrlFor('kvdemo'));

    expect(client).toBeInstanceOf(SecretClient);
    expect((client as SecretClient).vaultUrl).toBe(vaultUrlFor('kvdemo'));
  });

  test('the_missing_secret_message_should_offer_the_key_vault_as_well_as_an_export', () => {
    expect(() => assertEntraConfigured()).toThrow(/ENTRA_KEY_VAULT_SECRET/);
  });
});
