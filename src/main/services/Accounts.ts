import { dataStore } from '../modules/store';

const onboardedKey = (email: string) => `onboarded:${normalise(email)}`;

export function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/** Whether the user has been through the first-time welcome. */
export async function isOnboarded(email: string): Promise<boolean> {
  return !!(await dataStore().get<string>(onboardedKey(email)));
}

export async function markOnboarded(email: string): Promise<void> {
  await dataStore().set(onboardedKey(email), new Date().toISOString());
}
