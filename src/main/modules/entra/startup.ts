import { assertEntraConfigured, entraConfig } from './config';
import { SecretGetter, loadEntraClientSecret, secretClientFor } from './secret';

/**
 * Everything sign in needs before the server listens. Switched off (ENTRA_ENABLED=false) it
 * needs nothing, and no vault is read. Otherwise the secret is read first, because it may
 * have to come from Key Vault, and then every setting is checked, so a missing one stops
 * the server here rather than failing a user's sign in later.
 *
 * Returns a line for the startup log.
 */
export async function prepareEntra(clientFor: (vaultUrl: string) => SecretGetter = secretClientFor): Promise<string> {
  if (!entraConfig.enabled) {
    return 'Entra sign in is switched off (ENTRA_ENABLED=false): sign in will say it is unavailable';
  }

  const source = await loadEntraClientSecret(clientFor);
  assertEntraConfigured();
  return `Entra client secret from ${source}`;
}
