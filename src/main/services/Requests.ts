import axios from 'axios';

import { Logger } from '../modules/logging';

import { submissionEndpoint } from './submissions';

const logger = Logger.getLogger('requests');

const REQUESTS_PATH = '/requests';

export type RequestType = 'SUBSCRIPTION' | 'PUBLISH';

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
