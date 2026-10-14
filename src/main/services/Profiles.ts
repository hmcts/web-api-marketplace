import { dataStore } from '../modules/store';

import { EntraClaims } from './Entra';
import { SignedInUser } from './SignIn';

/**
 * Entra holds who someone is - their oid, name, email address and password - and nothing
 * else. Their organisation and whether they consume or publish APIs are ours, asked for on
 * the welcome page the first time they sign in, and kept here against their oid, which
 * never changes even if their name or email address does.
 *
 */

export type AccountRole = 'consumer' | 'producer';

export interface Profile {
  orgName: string;
  role: AccountRole;
  /** When they agreed to the guidelines on the welcome page. */
  onboardedAt: string;
}

const profileKey = (oid: string) => `profile:${oid}`;

export function normalise(email: string): string {
  return email.trim().toLowerCase();
}

export async function findProfile(oid: string): Promise<Profile | undefined> {
  return dataStore().get<Profile>(profileKey(oid));
}

export async function saveProfile(oid: string, profile: Profile): Promise<void> {
  await dataStore().set(profileKey(oid), profile);
}

/**
 * The session's user, from Entra's claims and our profile if there is one yet.
 *
 * `local`, with an id of 0, until the backend can resolve an Entra user: their submissions
 * go to the data store, since the backend would reject a user id it has never seen.
 */
export function toSignedInUser(claims: EntraClaims, profile: Profile | undefined): SignedInUser {
  const [first = '', ...rest] = (claims.name ?? '').trim().split(/\s+/);

  return {
    id: 0,
    local: true,
    oid: claims.oid,
    email: normalise(claims.email ?? ''),
    firstName: claims.givenName || first,
    lastName: claims.familyName || rest.join(' '),
    orgName: profile?.orgName ?? '',
    role: profile?.role,
  };
}
