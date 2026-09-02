import axios from 'axios';

import { Logger } from '../modules/logging';

import { backendUrl } from './BackendHealth';

const logger = Logger.getLogger('sign-in');

export interface SignedInUser {
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

export interface SignInResult {
  ok: boolean;
  user?: SignedInUser;
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
  try {
    const response = await axios.post(
      `${backendUrl}/login`,
      { email, password },
      { timeout: 5000, validateStatus: () => true }
    );

    if (response.status === 200) {
      logger.info('Sign in succeeded');
      return { ok: true, user: response.data as SignedInUser };
    }

    // 404 (unknown email) and 400 (validation) are both reported to the user as a single
    // "incorrect email or password", so the page does not reveal which accounts exist.
    logger.info(`Sign in rejected with status ${response.status}`);
    return { ok: false };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Sign in request failed: ${detail}`);
    return { ok: false };
  }
}
