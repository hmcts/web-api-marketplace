import config from 'config';

/**
 * Where Microsoft Entra External ID is, and what to talk to it with.
 *
 * Local development defaults to the HMCTS sandbox tenant (`entra` in
 * config/development.json, loaded only when NODE_ENV is development). Every deployed
 * environment runs as production and has no defaults at all, so it must name its own
 * tenant — it cannot fall back to the sandbox by accident. None of these but the secret is
 * a credential: the client ID and the tenant's endpoints go to the browser on every sign in.
 *
 * Each value is read from the environment on every use rather than once at import, so an
 * environment set up after this module loaded (as the route tests do, pointing it at a
 * stub tenant) is still honoured. The same is why these are not in
 * custom-environment-variables.json, which the config package reads only once.
 */
export const entraConfig = {
  get clientId(): string {
    return process.env.ENTRA_CLIENT_ID || config.get<string>('entra.clientId');
  },
  /** From the key vault in AKS (see modules/properties-volume), or exported locally. */
  get clientSecret(): string | undefined {
    return process.env.ENTRA_CLIENT_SECRET || config.get<string>('entra.clientSecret') || undefined;
  },
  /** From the key vault in AKS, alongside the client ID and secret. Enough for both endpoints. */
  get tenantId(): string {
    return process.env.ENTRA_TENANT_ID || config.get<string>('entra.tenantId');
  },
  get authorizeEndpoint(): string {
    return (
      process.env.ENTRA_AUTHORIZE_ENDPOINT ||
      config.get<string>('entra.authorizeEndpoint') ||
      tenantEndpoint('authorize')
    );
  },
  get tokenEndpoint(): string {
    return process.env.ENTRA_TOKEN_ENDPOINT || config.get<string>('entra.tokenEndpoint') || tenantEndpoint('token');
  },
  /**
   * Where the tenant publishes its issuer, signing keys and sign-out address. Derived from
   * the token endpoint, since both hang off the same authority:
   * https://<host>/<tenant>/oauth2/v2.0/token.
   */
  get discoveryEndpoint(): string {
    return (
      process.env.ENTRA_DISCOVERY_ENDPOINT ||
      entraConfig.tokenEndpoint.replace(/\/oauth2\/v2\.0\/token$/, '/v2.0/.well-known/openid-configuration')
    );
  },
  /**
   * Must be registered on the app registration exactly as written, or Entra answers
   * AADSTS50011 (redirect URI mismatch) before the user sees a sign-in form.
   */
  get redirectUri(): string {
    return process.env.ENTRA_REDIRECT_URI || config.get<string>('entra.redirectUri');
  },
  /** Where Entra sends the browser after signing out. Also registered on the app registration. */
  get postLogoutRedirectUri(): string {
    return process.env.ENTRA_POST_LOGOUT_REDIRECT_URI || config.get<string>('entra.postLogoutRedirectUri');
  },
  scope: 'openid profile email',
};

/**
 * An endpoint on the tenant's own host. External ID publishes its endpoints, and its issuer,
 * under https://<tenant-id>.ciamlogin.com/<tenant-id>/ — see that tenant's
 * /v2.0/.well-known/openid-configuration. Empty without a tenant ID, so the setting is reported.
 */
function tenantEndpoint(name: string): string {
  const tenantId = entraConfig.tenantId;
  return tenantId ? `https://${tenantId}.ciamlogin.com/${tenantId}/oauth2/v2.0/${name}` : '';
}

/** Every setting sign in needs, by the environment variable that sets it. */
const REQUIRED: [string, () => string | undefined][] = [
  ['ENTRA_CLIENT_ID', () => entraConfig.clientId],
  ['ENTRA_CLIENT_SECRET', () => entraConfig.clientSecret],
  ['ENTRA_AUTHORIZE_ENDPOINT', () => entraConfig.authorizeEndpoint],
  ['ENTRA_TOKEN_ENDPOINT', () => entraConfig.tokenEndpoint],
  ['ENTRA_REDIRECT_URI', () => entraConfig.redirectUri],
  ['ENTRA_POST_LOGOUT_REDIRECT_URI', () => entraConfig.postLogoutRedirectUri],
];

/**
 * Checked when the server starts, so a missing setting is a refusal to start that names it,
 * rather than a 400 from Entra after the user has already typed their password — or, in a
 * deployed environment, signing users in against the wrong tenant.
 */
export function assertEntraConfigured(): void {
  const missing = REQUIRED.filter(([, value]) => !value()).map(([name]) => name);

  if (!missing.length) {
    return;
  }

  throw new Error(
    [
      `Cannot start: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
      '',
      'Locally only the secret is needed — everything else defaults to the HMCTS sandbox tenant:',
      '',
      '  export ENTRA_CLIENT_SECRET=...   # from the Entra app registration',
      '',
      'Or read it from Key Vault: set ENTRA_KEY_VAULT and ENTRA_KEY_VAULT_SECRET.',
      '',
      'A deployed environment must set every ENTRA_* value for its own tenant. Never put the secret in a file here.',
      'ENTRA_TENANT_ID alone sets both endpoints; in AKS it is mounted from the tenant’s key vault.',
    ].join('\n')
  );
}
