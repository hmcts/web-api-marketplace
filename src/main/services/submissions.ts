import axios from 'axios';

import { AppLogger } from '../modules/logging';

import { backendUrl } from './BackendHealth';

/**
 * Logging for the service's form submissions.
 *
 * Every submission says where it is going before it goes, and a form with nowhere to send
 * to says so in as many words. The reason is a day lost to a sign-in that reported
 * "Incorrect email or password": the backend was answering 404 because the login endpoint
 * had not been deployed yet, and nothing in the logs distinguished that from a wrong
 * password or told us which address had been called. Naming the endpoint on every
 * submission makes a misconfiguration obvious from the log alone.
 */

/** The full address a submission is sent to, so one log line names it in one piece. */
export interface SubmitResult {
  ok: boolean;
  reference?: string;
}

export function submissionEndpoint(path: string): string {
  return `${backendUrl}${path}`;
}

/** Records where a submission is going, before it goes. */
export function logSubmission(logger: AppLogger, form: string, path: string): void {
  logger.info(`${form}: submitting to POST ${submissionEndpoint(path)}`);
}

/**
 * Records that a form has nowhere to submit to yet.
 *
 * These forms show the user a confirmation and a reference, so the log is the only place
 * that says the submission went nowhere. Say it plainly.
 */
export function logNotImplemented(logger: AppLogger, form: string, detail: string): void {
  logger.info(`${form}: not implemented — no backend endpoint, nothing was persisted (${detail})`);
}

export async function postSubmission(
  logger: AppLogger,
  label: string,
  detail: string,
  path: string,
  requesterId: number,
  body: Record<string, unknown>
): Promise<SubmitResult> {
  const url = submissionEndpoint(path);

  logSubmission(logger, `${label} ${detail}`, path);

  try {
    const response = await axios.post(url, body, {
      timeout: 10000,
      validateStatus: () => true,
      headers: { requestingUserId: String(requesterId) },
    });

    if (response.status === 201) {
      const reference = String((response.data as { reference?: string })?.reference ?? '');
      logger.info(`${label} stored as ${reference} at ${url}`);
      return { ok: true, reference };
    }

    logger.error(`${label} rejected with status ${response.status} from ${url}`);
    return { ok: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${label} to ${url} failed: ${reason}`);
    return { ok: false };
  }
}
