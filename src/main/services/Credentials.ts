import crypto from 'node:crypto';

/**
 * Issues the credentials an application uses to call APIs: one Entra ID client ID and
 * secret per application, and one APIM subscription key per API it is subscribed to.
 *
 * SIMULATED. Real issuing belongs to service-api-marketplace — an Entra app registration
 * through Microsoft Graph and a subscription on the APIM product — and is not built yet.
 * Until it is, these are generated here in the same shapes, so the journeys around them
 * can be built and tested. Pages that show them say so (see `credentialsAreSimulated`),
 * so nobody mistakes them for credentials that will authenticate anywhere.
 */
export const credentialsAreSimulated = true;

/** Matches what Entra returns as a secret's hint: its first three characters. */
const SECRET_HINT_LENGTH = 3;

/** Entra's default lifetime for a client secret created without an end date. */
const SECRET_LIFETIME_DAYS = 180;

export interface ClientSecret {
  /** Shown to the user once, then discarded. Never stored. */
  value: string;
  hint: string;
  createdAt: string;
  expiresAt: string;
}

export function issueClientId(): string {
  return crypto.randomUUID();
}

export function issueClientSecret(): ClientSecret {
  // Entra secrets are 40 characters with a "~" at the fourth position.
  const random = crypto.randomBytes(30).toString('base64url').slice(0, 37);
  const value = `${random.slice(0, 3)}8Q~${random.slice(3)}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SECRET_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  return {
    value,
    hint: value.slice(0, SECRET_HINT_LENGTH),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/** The shape of an APIM subscription key: 32 hexadecimal characters. */
export function issueSubscriptionKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * The APIM product an API is published under. Fixed per API and repeated across every
 * application subscribed to it — only the subscription key is unique to the pair.
 */
export function publisherIdFor(apiName: string): string {
  return apiName.replace(/^api-/, '');
}

/** "abc****" — enough for the owner to tell which secret is in use, and no more. */
export function maskSecret(hint: string): string {
  return `${hint}****`;
}
