import axios from 'axios';

import { Logger } from '../modules/logging';

import { FieldError, SummaryRow, looksLikeAnEmailAddress, toAnswerText } from './answers';
import { logSubmission, submissionEndpoint } from './submissions';

const logger = Logger.getLogger('publication-request');

/** Where the backend stores a request to publish an API. */
const PUBLISH_REQUESTS_PATH = '/publish-requests';

/** Match the backend's own limits, so an over-long answer fails on the form. */
export const API_NAME_MAX_LENGTH = 255;
export const OWNING_TEAM_MAX_LENGTH = 255;
export const SPEC_URL_MAX_LENGTH = 2048;

/**
 * Who is asking. Taken from the signed-in session, never from the request body, so a
 * request cannot be submitted in someone else's name by editing a hidden field.
 */
export interface Requester {
  /** What the backend attributes the stored request to. */
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  orgName: string;
}

export interface SubmitResult {
  ok: boolean;
  reference?: string;
}

/** Field names match the prototype's, so the answers keep one shape end to end. */
export interface PublicationRequestAnswers {
  'api-name': string;
  'owning-team': string;
  'contact-email': string;
  'spec-url': string;
}

export function toPublicationAnswers(body: Record<string, unknown> = {}): PublicationRequestAnswers {
  return {
    'api-name': toAnswerText(body, 'api-name'),
    'owning-team': toAnswerText(body, 'owning-team'),
    'contact-email': toAnswerText(body, 'contact-email'),
    'spec-url': toAnswerText(body, 'spec-url'),
  };
}

export function validatePublication(answers: PublicationRequestAnswers): FieldError[] {
  const errors: FieldError[] = [];

  if (!answers['api-name']) {
    errors.push({ name: 'api-name', text: 'Enter the name of your API' });
  } else if (answers['api-name'].length > API_NAME_MAX_LENGTH) {
    errors.push({ name: 'api-name', text: `The API name must be ${API_NAME_MAX_LENGTH} characters or fewer` });
  }
  if (!answers['owning-team']) {
    errors.push({ name: 'owning-team', text: 'Enter the team that owns the API' });
  } else if (answers['owning-team'].length > OWNING_TEAM_MAX_LENGTH) {
    errors.push({
      name: 'owning-team',
      text: `The owning team must be ${OWNING_TEAM_MAX_LENGTH} characters or fewer`,
    });
  }

  if (!answers['contact-email']) {
    errors.push({ name: 'contact-email', text: 'Enter a team inbox email address' });
  } else if (!looksLikeAnEmailAddress(answers['contact-email'])) {
    errors.push({
      name: 'contact-email',
      text: 'Enter a team inbox email address in the correct format, like api-team@justice.gov.uk',
    });
  }

  if (!answers['spec-url']) {
    errors.push({ name: 'spec-url', text: 'Enter the URL of your OpenAPI specification' });
  } else if (!isHttpUrl(answers['spec-url'])) {
    errors.push({ name: 'spec-url', text: 'Enter the specification URL in full, starting with https://' });
  } else if (answers['spec-url'].length > SPEC_URL_MAX_LENGTH) {
    errors.push({
      name: 'spec-url',
      text: `The specification URL must be ${SPEC_URL_MAX_LENGTH} characters or fewer`,
    });
  }

  return errors;
}

export function publicationSummaryRows(answers: PublicationRequestAnswers): SummaryRow[] {
  return [
    { key: 'API name', value: answers['api-name'] },
    { key: 'Owning team', value: answers['owning-team'] },
    { key: 'Team contact email', value: answers['contact-email'] },
    { key: 'OpenAPI specification URL', value: answers['spec-url'] },
  ];
}

/**
 * Stores the request against the backend and returns the reference to quote.
 *
 * The requester's name, organisation and email are not sent. The backend looks them up
 * from the user id in the requestingUserId header and stamps them onto what it stores, so
 * sending them would be offering it a second, forgeable copy of what it already knows.
 *
 * The reference is the backend's own id. Generating one here would be showing the user
 * something no record can be found by.
 */
export async function submitPublicationRequest(
  answers: PublicationRequestAnswers,
  requester: Requester
): Promise<SubmitResult> {
  const url = submissionEndpoint(PUBLISH_REQUESTS_PATH);
  const body = {
    apiName: answers['api-name'],
    owningTeam: answers['owning-team'],
    contactEmail: answers['contact-email'],
    specUrl: answers['spec-url'],
  };

  logSubmission(
    logger,
    `Publication request for ${answers['api-name']} by user ${requester.id}`,
    PUBLISH_REQUESTS_PATH
  );

  try {
    const response = await axios.post(url, body, {
      timeout: 10000,
      validateStatus: () => true,
      headers: { requestingUserId: String(requester.id) },
    });

    if (response.status === 201) {
      const reference = String((response.data as { id?: string })?.id ?? '');
      logger.info(`Publication request stored as ${reference} at ${url}`);
      return { ok: true, reference };
    }

    logger.error(`Publication request rejected with status ${response.status} from ${url}`);
    return { ok: false };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Publication request to ${url} failed: ${detail}`);
    return { ok: false };
  }
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
