import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

import { entraConfig } from './config';

/** The one call this module makes on a key vault, so the tests can hand in a fake one. */
export interface SecretGetter {
  getSecret(name: string): Promise<{ value?: string }>;
}

export const vaultUrlFor = (vaultName: string): string => `https://${vaultName}.vault.azure.net`;

/**
 * DefaultAzureCredential is what lets one code path run anywhere: in AKS it is the pod's
 * workload identity (a managed identity, so no secret is needed to get the secret), and
 * locally it is the developer's `az login` session.
 */
export function secretClientFor(vaultUrl: string): SecretGetter {
  return new SecretClient(vaultUrl, new DefaultAzureCredential());
}

/**
 * Where the Entra client secret comes from, in order:
 *
 *   1. ENTRA_CLIENT_SECRET, exported or mounted from the key vault by the properties volume
 *   2. Key Vault ENTRA_KEY_VAULT / ENTRA_KEY_VAULT_SECRET, read with DefaultAzureCredential
 *
 * The value read is put in this process's environment only, never in a file or a log.
 * Returns where the secret came from, for the startup log, or undefined if from nowhere — which
 * assertEntraConfigured then reports.
 */
export async function loadEntraClientSecret(
  clientFor: (vaultUrl: string) => SecretGetter = secretClientFor
): Promise<string | undefined> {
  if (entraConfig.clientSecret) {
    return 'environment';
  }

  const vault = process.env.ENTRA_KEY_VAULT;
  const name = process.env.ENTRA_KEY_VAULT_SECRET;
  if (!vault || !name) {
    return undefined;
  }

  let value: string | undefined;
  try {
    ({ value } = await clientFor(vaultUrlFor(vault)).getSecret(name));
  } catch (error) {
    throw new Error(
      [
        `Cannot start: could not read the Entra client secret from Key Vault ${vault}/${name}.`,
        '',
        `  ${(error as Error).message.split('\n')[0]}`,
        '',
        "Locally, run 'az login' with an account that can read that secret. In AKS, check the",
        "pod's workload identity is one of the secret's readers.",
      ].join('\n'),
      { cause: error }
    );
  }
  if (!value) {
    throw new Error(`Cannot start: Key Vault ${vault}/${name} is empty.`);
  }

  process.env.ENTRA_CLIENT_SECRET = value;
  return `Key Vault ${vault}/${name}`;
}
