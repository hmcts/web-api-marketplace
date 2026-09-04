import axios from 'axios';

import { Logger } from '../modules/logging';

import { submissionEndpoint } from './submissions';

const logger = Logger.getLogger('requests');

const REQUESTS_PATH = '/requests';

export type RequestType = 'SUBSCRIPTION' | 'PUBLISH';

/**
 * Where each kind of request is stored. The list endpoint returns both kinds together,
 * but there is no combined endpoint to delete through — each type is deleted from the
 * collection that owns it, so the type has to travel with the reference.
 */
const PATHS: Record<RequestType, string> = {
  SUBSCRIPTION: '/subscriptions',
  PUBLISH: '/publish-requests',
};

/**
 * Whether a posted type is one we know how to delete. The type comes back from the page
 * as a hidden field, so it is checked rather than trusted: an unknown value must not be
 * pasted into a backend path.
 */
export function isRequestType(value: unknown): value is RequestType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PATHS, value);
}

export interface RequestSummary {
  reference: string;
  type: RequestType;
  submittedAt: string;
  status: string;
}

export interface RequestsResult {
  ok: boolean;
  requests: RequestSummary[];
}

export async function getRequestsFor(userId: number): Promise<RequestsResult> {
  const url = submissionEndpoint(REQUESTS_PATH);

  try {
    const response = await axios.get<RequestSummary[]>(url, {
      timeout: 10000,
      validateStatus: () => true,
      headers: { requestingUserId: String(userId) },
    });

    if (response.status !== 200) {
      logger.error(`Listing requests returned ${response.status} from ${url}`);
      return { ok: false, requests: [] };
    }

    const requests = Array.isArray(response.data) ? response.data : [];

    logger.info(`Listed ${requests.length} requests from ${url}`);
    return { ok: true, requests };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Listing requests from ${url} failed: ${reason}`);
    return { ok: false, requests: [] };
  }
}

/**
 * Deletes one of the user's own requests and says whether it is gone.
 *
 * Identified by the reference rather than the backend's internal id: the reference is
 * what the user is shown and what the list returns, and it keeps internal ids out of the
 * page's HTML. The user id goes in the same header the list uses, so the backend can
 * refuse to delete a request belonging to someone else — nothing here can enforce that
 * on its own, since the reference is all the caller holds.
 */
export async function deleteRequest(userId: number, type: RequestType, reference: string): Promise<boolean> {
  const url = submissionEndpoint(`${PATHS[type]}/${encodeURIComponent(reference)}`);

  try {
    const response = await axios.delete(url, {
      timeout: 10000,
      validateStatus: () => true,
      headers: { requestingUserId: String(userId) },
    });

    // A 404 counts as deleted. The request is not there any more, which is what was
    // asked for, and it is what a second click or a resubmitted form produces — telling
    // the user that failed would contradict the list they are about to be shown.
    if (response.status === 204 || response.status === 404) {
      logger.info(`Deleted ${type} request at ${url} (${response.status})`);
      return true;
    }

    logger.error(`Deleting ${type} request returned ${response.status} from ${url}`);
    return false;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Deleting ${type} request at ${url} failed: ${reason}`);
    return false;
  }
}
