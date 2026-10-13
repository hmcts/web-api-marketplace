import { JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';

import { entraConfig } from '../modules/entra/config';

/**
 * Everything that talks to Microsoft Entra External ID, kept away from the routing.
 *
 * The browser carries a single-use authorization code, never
 * a token; this service swaps the code for an ID token server to server, with the client
 * secret; and nothing in that token is believed until its signature and claims have been
 * checked. Entra hosts the sign-in, create-account and password-reset pages, so no
 * password ever reaches this service.
 */

/** Who Entra says signed in. `oid` is the one to key our records on: it never changes. */
export interface EntraClaims {
  oid: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
}

/**
 * What a sign in may ask Entra for: `login` shows its form even when the browser already
 * has a session there, and `create` opens on the create-account form.
 */
export type EntraPrompt = 'login' | 'create';

export function isEntraPrompt(value: unknown): value is EntraPrompt {
  return value === 'login' || value === 'create';
}

/**
 * The address to send the browser to. response_type=code is the whole security design:
 * the browser carries a single-use authorization code, never a token.
 */
export function authorizeUrl(state: string, nonce: string, prompt?: EntraPrompt): string {
  const url = new URL(entraConfig.authorizeEndpoint);
  url.searchParams.set('client_id', entraConfig.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', entraConfig.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', entraConfig.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  if (prompt) {
    url.searchParams.set('prompt', prompt);
  }
  return url.toString();
}

/** The back channel: this service to Microsoft, over TLS, with the client secret. No browser involved. */
export async function exchangeCodeForIdToken(code: string): Promise<string> {
  const response = await fetch(entraConfig.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: entraConfig.clientId,
      client_secret: entraConfig.clientSecret ?? '',
      code,
      redirect_uri: entraConfig.redirectUri,
      grant_type: 'authorization_code',
      scope: entraConfig.scope,
    }),
  });
  const body = (await response.json()) as { id_token?: string; error?: string; error_description?: string };

  if (!response.ok || !body.id_token) {
    // Entra's error code and description, never the request: that carried the secret.
    throw new Error(`${response.status} ${body.error ?? 'no id_token'}: ${body.error_description ?? ''}`.trim());
  }
  return body.id_token;
}

/**
 * Verifies the ID token and reads the claims out of it. Nothing in the token is believed
 * until all of this has passed:
 *
 *   signature  made by one of the tenant's published keys (looked up by the token's `kid`)
 *   alg        RS256 only - never what the token's own header asks for, which is how
 *              `alg: none` and HS256 key-confusion forgeries get through
 *   iss        this tenant, as its discovery document names it
 *   aud        this app's client ID - a token issued to some other app is not for us
 *   exp, nbf   in date, with a minute of clock skew allowed
 *   nonce      the one this browser was given when sign in started, so a token from
 *              another sign in cannot be replayed into this one
 *
 * It arrived over TLS from the token endpoint, so the signature is arguably belt and
 * braces here (OIDC Core 3.1.3.7 allows TLS in its place). It is checked anyway: it costs
 * nothing once the keys are cached, and it means this is safe wherever the token came from.
 */
export async function verifiedClaims(idToken: string, expectedNonce: string | undefined): Promise<EntraClaims> {
  const { issuer, keys } = await tenant();
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ['RS256'],
    issuer,
    audience: entraConfig.clientId,
    clockTolerance: 60,
  });

  if (!expectedNonce || payload.nonce !== expectedNonce) {
    throw new Error('nonce does not match this sign in');
  }
  if (typeof payload.oid !== 'string' || !payload.oid) {
    throw new Error('no oid claim');
  }

  const emails = payload.emails as string[] | undefined;
  return {
    oid: payload.oid,
    // External ID returns an array in some configurations.
    email: (payload.email as string | undefined) || emails?.[0],
    name: payload.name as string | undefined,
    givenName: payload.given_name as string | undefined,
    familyName: payload.family_name as string | undefined,
  };
}

/**
 * Where to send the browser to sign out of Entra too. Destroying our session alone would
 * leave the Entra one in place, and the next "Sign in" would go straight through as the
 * same person without asking.
 *
 * Falls back to the home page if the tenant cannot be reached: the user is signed out of
 * this service regardless, which is the part that matters most.
 */
export async function logoutUrl(): Promise<string> {
  try {
    const { endSessionEndpoint } = await tenant();
    if (!endSessionEndpoint) {
      return '/';
    }
    const url = new URL(endSessionEndpoint);
    url.searchParams.set('post_logout_redirect_uri', entraConfig.postLogoutRedirectUri);
    return url.toString();
  } catch {
    return '/';
  }
}

interface Tenant {
  issuer: string;
  keys: JWTVerifyGetKey;
  endSessionEndpoint?: string;
}

/**
 * The tenant's issuer, signing keys and sign-out address, fetched once from its discovery
 * document. The key set is jose's remote JWKS, which caches the keys and refetches when a
 * token names a `kid` it has not seen - which is what happens when Entra rotates them. A
 * failed fetch is not cached, so the next sign in tries again.
 */
let tenantPromise: Promise<Tenant> | undefined;
let tenantFrom: string | undefined;

function tenant(): Promise<Tenant> {
  // A different discovery address means a different tenant, so what was cached is not it.
  if (tenantFrom !== entraConfig.discoveryEndpoint) {
    tenantPromise = undefined;
    tenantFrom = entraConfig.discoveryEndpoint;
  }
  tenantPromise ??= fetchTenant().catch(error => {
    tenantPromise = undefined;
    throw error;
  });
  return tenantPromise;
}

async function fetchTenant(): Promise<Tenant> {
  const endpoint = entraConfig.discoveryEndpoint;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`discovery failed: ${response.status} from ${endpoint}`);
  }
  const document = (await response.json()) as { issuer: string; jwks_uri: string; end_session_endpoint?: string };
  return {
    issuer: document.issuer,
    keys: createRemoteJWKSet(new URL(document.jwks_uri)),
    endSessionEndpoint: document.end_session_endpoint,
  };
}
