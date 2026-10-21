import { EntraClaims } from './Entra';
import { SignedInUser } from './SignIn';

/**
 * Entra holds who someone is - their oid, name, email address and password. Nothing about
 * them is kept here: this turns what Entra says into the user the session holds.
 */

export function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/** The session's user, with the backend's id. Still `local`: the backend has no requests yet. */
export function toSignedInUser(claims: EntraClaims, id: number, userReference: string): SignedInUser {
  return {
    id,
    userReference,
    local: true,
    oid: claims.oid,
    email: normalise(claims.email ?? ''),
    name: (claims.name ?? '').trim(),
  };
}
