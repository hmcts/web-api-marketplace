import { Counter, metrics } from '@opentelemetry/api';

import { Logger } from '../modules/logging';

/** Why a sign in did not start a session. Never carries the code, the token or who it was. */
export type SignInFailureReason =
  | 'cancelled'
  | 'state_mismatch'
  | 'token_exchange_failed'
  | 'token_rejected'
  | 'user_not_saved'
  | 'session_not_started';

export const SIGN_IN_FAILED = 'SIGN_IN_FAILED';
export const SIGN_IN_FAILURES_METRIC = 'amp.sign_in.failures';

const logger = Logger.getLogger('security');

let signInFailures: Counter | undefined;

// Fetched on first use: the App Insights SDK registers the meter provider at start-up, after this module loads.
function signInFailureCounter(): Counter {
  signInFailures ??= metrics
    .getMeter('amp-marketplace-web')
    .createCounter(SIGN_IN_FAILURES_METRIC, { description: 'Sign ins that did not start a session, by reason' });
  return signInFailures;
}

export function recordSignInFailure(reason: SignInFailureReason): void {
  logger.event('warn', `${SIGN_IN_FAILED} reason=${reason}`, { event: SIGN_IN_FAILED, reason });
  try {
    signInFailureCounter().add(1, { reason });
  } catch {
    // A metric must never stop the user being shown the sign in problem.
  }
}
