import { entraBypass } from '../../services/EntraBypass';

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
  if (entraBypass.enabled) {
    return `BYPASS_ENTRA is on: /sign-in starts a session as ${entraBypass.claims.email} WITHOUT Entra. Local development only`;
  }

  // Noted rather than returned on, so the Entra checks below still run.
  const ignored = entraBypass.refused ? 'BYPASS_ENTRA is set but ignored: it works only in development on a Mac. ' : '';

  if (!entraConfig.enabled) {
    return `${ignored}Entra sign in is switched off (ENTRA_ENABLED=false): sign in will say it is unavailable`;
  }

  const source = await loadEntraClientSecret(clientFor);
  assertEntraConfigured();
  return `${ignored}Entra client secret from ${source}`;
}
