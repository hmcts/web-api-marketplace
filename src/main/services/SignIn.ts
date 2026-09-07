import axios from 'axios';

import { Logger } from '../modules/logging';

import { backendUrl } from './BackendHealth';
import { logSubmission, submissionEndpoint } from './submissions';

const logger = Logger.getLogger('sign-in');

export interface SignedInUser {
  /** The backend's own user id, which every request it stores is attributed to. */
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

export interface SignInResult {
  ok: boolean;
  user?: SignedInUser;
  /**
   * Set when sign in could not be attempted at all, rather than being refused.
   *
   * The distinction matters to the user: a refusal means check what you typed, while this
   * means nothing you type will work yet. Reporting an outage as "incorrect email or
   * password" sends people off to reset a password that was never wrong — which is what
   * this service used to do.
   */
  unavailable?: boolean;
}

/**
 * Signs in against the backend's POST /login.
 *
 * The call is made here rather than from the browser: the backend is not reachable from
 * the public internet, and the CSP connect-src only permits this origin. It also keeps
 * credentials off the client's network tab beyond our own domain.
 *
 * The backend endpoint is currently a stub that does not verify the password, so a
 * successful result here means only "this email is a known account".
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const endpoint = submissionEndpoint('/login');

  logSubmission(logger, 'Sign in', '/login');

  try {
    const response = await axios.post(
      `${backendUrl}/login`,
      { email, password },
      { timeout: 5000, validateStatus: () => true }
    );

    if (response.status === 200) {
      logger.info(`Sign in succeeded via ${endpoint}`);
      return { ok: true, user: response.data as SignedInUser };
    }

    // The backend itself failed. Nothing the user typed is at fault, so this is reported
    // as an outage rather than as a refusal.
    if (response.status >= 500) {
      logger.error(`Sign in unavailable: ${response.status} from ${endpoint}`);
      return { ok: false, unavailable: true };
    }

    // 404 (unknown email) and 400 (validation) are both reported to the user as a single
    // "incorrect email or password", so the page does not reveal which accounts exist.
    // The endpoint goes in the log line because a 404 also looks like this when the route
    // is simply not deployed, and only the address tells the two apart.
    logger.info(`Sign in rejected with status ${response.status} from ${endpoint}`);
    return { ok: false };
  } catch (error) {
    // Nothing answered: a refused connection, an unresolvable host, or the timeout above.
    // Whatever the cause, the sign-in service is not there to say yes or no.
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Sign in request to ${endpoint} failed: ${detail}`);
    return { ok: false, unavailable: true };
  }
}
