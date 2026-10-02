import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { dataStore } from '../modules/store';

import { SignedInUser } from './SignIn';

const scrypt = promisify(crypto.scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;

/**
 * Developer accounts created through this service's own registration journey.
 *
 * service-api-marketplace can look an account up (its /login is a stub that never checks
 * the password) but cannot create one, verify an email address or reset a password. Until
 * it can, the accounts registered here live in the data store, with a properly hashed
 * password. Accounts the backend already knows sign in against the backend as before; see
 * SignInController for the order the two are tried in.
 */

export const PASSWORD_MIN_LENGTH = 12;

const VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const RESET_TOKEN_TTL_SECONDS = 60 * 60;

export type AccountRole = 'consumer' | 'producer';

export interface Account {
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
  role: AccountRole;
  passwordHash: string;
  salt: string;
  verified: boolean;
  createdAt: string;
}

export interface Registration {
  firstName: string;
  lastName: string;
  email: string;
  orgName: string;
  role: AccountRole;
  password: string;
}

export type RegisterResult = { created: true; token: string } | { created: false };

export type AuthenticateResult =
  | { status: 'ok'; user: SignedInUser }
  | { status: 'unverified' }
  | { status: 'rejected' }
  /** Not an account registered here — the backend may still know it. */
  | { status: 'unknown' };

const accountKey = (email: string) => `account:${normalise(email)}`;
const verifyKey = (token: string) => `token:verify:${token}`;
const resetKey = (token: string) => `token:reset:${token}`;
const onboardedKey = (email: string) => `onboarded:${normalise(email)}`;

export function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Creates an unverified account and returns the token that verifies it, or says the
 * address is already registered. The caller must not tell the visitor which: both lead to
 * the same "check your email" page, with a different email behind it.
 */
export async function register(registration: Registration): Promise<RegisterResult> {
  if (await findAccount(registration.email)) {
    return { created: false };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const account: Account = {
    email: normalise(registration.email),
    firstName: registration.firstName,
    lastName: registration.lastName,
    orgName: registration.orgName,
    role: registration.role,
    passwordHash: await hash(registration.password, salt),
    salt,
    verified: false,
    createdAt: new Date().toISOString(),
  };

  await dataStore().set(accountKey(account.email), account);
  return { created: true, token: await issueVerificationToken(account.email) };
}

export async function findAccount(email: string): Promise<Account | undefined> {
  return dataStore().get<Account>(accountKey(email));
}

export async function issueVerificationToken(email: string): Promise<string> {
  const token = newToken();
  await dataStore().set(verifyKey(token), normalise(email), VERIFY_TOKEN_TTL_SECONDS);
  return token;
}

/** Verifies the account the token was issued for. A token works once. */
export async function verifyEmail(token: string): Promise<Account | undefined> {
  const email = token ? await dataStore().get<string>(verifyKey(token)) : undefined;
  const account = email ? await findAccount(email) : undefined;

  if (!account) {
    return undefined;
  }

  await dataStore().delete(verifyKey(token));
  account.verified = true;
  await dataStore().set(accountKey(account.email), account);
  return account;
}

export async function authenticate(email: string, password: string): Promise<AuthenticateResult> {
  const account = await findAccount(email);

  if (!account) {
    return { status: 'unknown' };
  }
  if (!(await matches(password, account))) {
    return { status: 'rejected' };
  }
  // Checked after the password, so an unverified address is only revealed to someone
  // who already knows its password.
  if (!account.verified) {
    return { status: 'unverified' };
  }
  return { status: 'ok', user: toSignedInUser(account) };
}

/**
 * Starts a reset for an account registered here, returning the token, or nothing for an
 * address that has no such account. As with registration, the caller shows the same page
 * either way.
 */
export async function startPasswordReset(email: string): Promise<string | undefined> {
  const account = await findAccount(email);

  if (!account) {
    return undefined;
  }

  const token = newToken();
  await dataStore().set(resetKey(token), account.email, RESET_TOKEN_TTL_SECONDS);
  return token;
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  return !!token && !!(await dataStore().get<string>(resetKey(token)));
}

/**
 * Sets a new password. The address is verified too: following a link sent to it proves
 * the owner can read it, which is all verification ever established.
 */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const email = token ? await dataStore().get<string>(resetKey(token)) : undefined;
  const account = email ? await findAccount(email) : undefined;

  if (!account) {
    return false;
  }

  await dataStore().delete(resetKey(token));
  account.salt = crypto.randomBytes(16).toString('hex');
  account.passwordHash = await hash(password, account.salt);
  account.verified = true;
  await dataStore().set(accountKey(account.email), account);
  return true;
}

/**
 * Whether the user has been through the first-time welcome. Kept by email address for
 * every user — the backend's accounts as well as ours — since the backend has nowhere to
 * keep it either.
 */
export async function isOnboarded(email: string): Promise<boolean> {
  return !!(await dataStore().get<string>(onboardedKey(email)));
}

export async function markOnboarded(email: string): Promise<void> {
  await dataStore().set(onboardedKey(email), new Date().toISOString());
}

export function validatePassword(password: string, confirmation: string): string | undefined {
  if (!password) {
    return 'Enter a password';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Your password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }
  if (password !== confirmation) {
    return 'The passwords you entered do not match';
  }
  return undefined;
}

function toSignedInUser(account: Account): SignedInUser {
  return {
    // The backend's ids start at 1. Nothing registered here is ever sent to it — `local`
    // routes this user's submissions to the data store instead — so 0 is never looked up.
    id: 0,
    local: true,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
    orgName: account.orgName,
    role: account.role,
  };
}

async function hash(password: string, salt: string): Promise<string> {
  return (await scrypt(password, salt, 64)).toString('hex');
}

async function matches(password: string, account: Account): Promise<boolean> {
  const candidate = Buffer.from(await hash(password, account.salt), 'hex');
  const stored = Buffer.from(account.passwordHash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
