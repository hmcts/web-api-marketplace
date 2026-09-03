import axios from 'axios';

import { Logger } from '../modules/logging';

import { submissionEndpoint } from './submissions';

const logger = Logger.getLogger('subscriptions');

const SUBSCRIPTIONS_PATH = '/subscriptions';

export interface Subscription {
  id: string;
  status: string;
  api: string;
  apiShortCode: string;
  environment: string;
  expectedVolume: string;
  useCase: string;
  requestingUserEmail: string;
}

export interface SubscriptionsResult {
  ok: boolean;
  subscriptions: Subscription[];
}

/**
 * The subscriptions belonging to one person.
 *
 * The backend has no per-user view: GET /subscriptions returns everyone's, so the filter
 * happens here. That means this process receives requests belonging to other people and
 * drops them before rendering — they never reach the browser, but the frontend is holding
 * data it has no business holding, and one mistake in the filter below would show someone
 * another user's requests. The endpoint should take the signed-in user and filter server
 * side, the way POST /subscriptions already takes requestingUserId.
 *
 * A failure is reported as a failure rather than as an empty list, so the page can say it
 * could not load them instead of telling someone they have never submitted anything.
 */
export async function getSubscriptionsFor(email: string): Promise<SubscriptionsResult> {
  const url = submissionEndpoint(SUBSCRIPTIONS_PATH);
  const wanted = (email ?? '').trim().toLowerCase();

  // Without this, an empty address would match every row that has none, and show one
  // user another's requests. There is no signed-in user this could legitimately be.
  if (!wanted) {
    logger.error('Refusing to list subscriptions for an empty address');
    return { ok: false, subscriptions: [] };
  }

  try {
    const response = await axios.get<Subscription[]>(url, { timeout: 10000, validateStatus: () => true });

    if (response.status !== 200) {
      logger.error(`Listing subscriptions returned ${response.status} from ${url}`);
      return { ok: false, subscriptions: [] };
    }

    const all = Array.isArray(response.data) ? response.data : [];
    const mine = all.filter(row => (row?.requestingUserEmail ?? '').trim().toLowerCase() === wanted);

    logger.info(`Listed ${mine.length} of ${all.length} subscriptions from ${url}`);
    return { ok: true, subscriptions: mine };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Listing subscriptions from ${url} failed: ${detail}`);
    return { ok: false, subscriptions: [] };
  }
}
