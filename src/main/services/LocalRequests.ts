import { dataStore } from '../modules/store';

import { normalise } from './Accounts';
import { SummaryRow, newReference } from './answers';

/**
 * Requests this service stores itself, because service-api-marketplace has nowhere to put
 * them yet: production credentials requests, requests for a new API, and the access and
 * publication requests of accounts registered here (the backend refuses a user id it has
 * never seen). They are listed under My requests alongside the backend's own.
 */
export type LocalRequestType = 'SUBSCRIPTION' | 'PUBLISH' | 'NEW_API' | 'PRODUCTION';

/**
 * The lifecycle a production credentials request moves through. Only SUBMITTED is set
 * by this service — the rest are a marketplace administrator's to set, and that tool does
 * not exist yet. Listed so the request page can explain what comes next.
 */
export const REQUEST_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'MORE_INFORMATION_NEEDED', 'APPROVED', 'DECLINED'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface StoredRequest {
  reference: string;
  type: LocalRequestType;
  submittedAt: string;
  status: RequestStatus;
  /** What was asked, as the check-answers page showed it, so it can be shown again. */
  rows: SummaryRow[];
}

const PREFIXES: Record<LocalRequestType, string> = {
  SUBSCRIPTION: 'SUB',
  PUBLISH: 'PUB',
  NEW_API: 'NEW',
  PRODUCTION: 'PCR',
};

const key = (ownerEmail: string) => `requests:${normalise(ownerEmail)}`;

export async function listLocalRequests(ownerEmail: string): Promise<StoredRequest[]> {
  return (await dataStore().get<StoredRequest[]>(key(ownerEmail))) ?? [];
}

export async function getLocalRequest(ownerEmail: string, reference: string): Promise<StoredRequest | undefined> {
  return (await listLocalRequests(ownerEmail)).find(request => request.reference === reference);
}

export async function addLocalRequest(
  ownerEmail: string,
  type: LocalRequestType,
  rows: SummaryRow[]
): Promise<StoredRequest> {
  const request: StoredRequest = {
    reference: newReference().replace(/^AMP-/, `${PREFIXES[type]}-`),
    type,
    submittedAt: new Date().toISOString(),
    status: 'SUBMITTED',
    rows,
  };

  await dataStore().set(key(ownerEmail), [...(await listLocalRequests(ownerEmail)), request]);
  return request;
}

/** Whether a request with that reference was this user's and is now gone. */
export async function deleteLocalRequest(ownerEmail: string, reference: string): Promise<boolean> {
  const requests = await listLocalRequests(ownerEmail);
  const remaining = requests.filter(request => request.reference !== reference);

  if (remaining.length === requests.length) {
    return false;
  }
  await dataStore().set(key(ownerEmail), remaining);
  return true;
}

export function statusText(status: string): string {
  return (
    {
      SUBMITTED: 'Submitted',
      IN_REVIEW: 'In review',
      MORE_INFORMATION_NEEDED: 'More information needed',
      APPROVED: 'Approved',
      DECLINED: 'Declined',
    }[status] ?? status
  );
}
