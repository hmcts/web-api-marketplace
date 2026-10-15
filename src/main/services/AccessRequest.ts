import { Logger } from '../modules/logging';

import { addLocalRequest } from './LocalRequests';
import { Choice, FieldError, SummaryRow, toAnswerText } from './answers';
import { SubmitResult, postSubmission } from './submissions';

// Re-exported so importers that predate services/answers keep working unchanged.
export type { Choice, FieldError, SummaryRow };

/**
 * Who is asking. Taken from the signed-in session, never from the request body, so a
 * request cannot be submitted in someone else's name by editing a hidden field.
 */
export interface Requester {
  /** What the backend attributes the stored request to. */
  id: number;
  name: string;
  email: string;
  /** A user the backend has never heard of — see services/Profiles. */
  local?: boolean;
}

const logger = Logger.getLogger('access-request');

/** The backend stores an access request as a subscription. */
const SUBSCRIPTIONS_PATH = '/subscriptions';

/**
 * What is sent as the environment now that the form no longer asks for one.
 *
 * The backend still declares environment @NotBlank, so omitting it would fail every
 * submission with a 400. A placeholder keeps requests going through and is honest about
 * the fact that nobody was asked — a plausible-looking default such as "sandbox" would
 * put an answer in the record that no user ever gave. Remove this, and stop sending the
 * field, once the backend no longer requires it.
 */
const ENVIRONMENT_NOT_ASKED = 'unspecified';

/** Likewise the declaration, which the form no longer carries but the backend still expects. */
const DECLARATION_NOT_ASKED = 'unspecified';

/** Matches the backend's own limit, so an over-long description fails on the form. */
export const USE_CASE_MAX_LENGTH = 255;

/**
 * The fixed answer lists, held here rather than in the template so that validation, the
 * form and the check-answers summary all read the same source. The catalogue list is not
 * here — it comes from the live feed, see ApiCatalogue.
 */
export const CALL_VOLUMES: Choice[] = [
  { value: 'low', text: 'Low', hint: { text: 'Under 1,000 calls per day' } },
  { value: 'medium', text: 'Medium', hint: { text: '1,000 to 100,000 calls per day' } },
  { value: 'high', text: 'High', hint: { text: 'Over 100,000 calls per day' } },
];

/**
 * What the form asks for. The requester is not in here: their name and email come from the signed-in session, so they cannot be posted and cannot be edited
 * into someone else's.
 */
export interface AccessRequestAnswers {
  'api-name': string;
  'call-volume': string;
  'use-case': string;
}

export const ANSWER_FIELDS: (keyof AccessRequestAnswers)[] = ['api-name', 'call-volume', 'use-case'];

export function toAnswers(body: Record<string, unknown> = {}): AccessRequestAnswers {
  const text = (name: string) => toAnswerText(body, name);

  return {
    'api-name': text('api-name'),
    'call-volume': text('call-volume'),
    'use-case': text('use-case'),
  };
}

/**
 * Validation runs on the server so the form reports errors with JavaScript unavailable.
 * Errors come back in field order, which is the order the error summary must list them in.
 */
export function validate(answers: AccessRequestAnswers, apiNames: string[]): FieldError[] {
  const errors: FieldError[] = [];

  if (!answers['api-name'] || !apiNames.includes(answers['api-name'])) {
    errors.push({ name: 'api-name', text: 'Select the API you need access to' });
  }

  requireChoice(errors, 'call-volume', answers['call-volume'], CALL_VOLUMES, 'Select the expected call volume');
  if (!answers['use-case']) {
    errors.push({ name: 'use-case', text: 'Describe what you are building and why you need this API' });
  } else if (answers['use-case'].length > USE_CASE_MAX_LENGTH) {
    // The backend rejects anything longer. Catching it here means a field error on the
    // form rather than a failed submission the user cannot act on.
    errors.push({
      name: 'use-case',
      text: `Your description must be ${USE_CASE_MAX_LENGTH} characters or fewer`,
    });
  }

  return errors;
}

/**
 * The rows shown on the check-answers page, with stored values turned back into their
 * labels. The requester's own details come from the session, so they are passed in rather
 * than read from the answers.
 */
export function summaryRows(answers: AccessRequestAnswers, apiTitle: string, requester: Requester): SummaryRow[] {
  return [
    { key: 'Name', value: requester.name },
    { key: 'Email', value: requester.email },
    { key: 'API', value: apiTitle || answers['api-name'] },
    { key: 'Expected call volume', value: labelFor(CALL_VOLUMES, answers['call-volume']) },
    { key: 'Use case', value: answers['use-case'] },
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
export async function submitAccessRequest(
  answers: AccessRequestAnswers,
  requester: Requester,
  apiTitle: string
): Promise<SubmitResult> {
  if (requester.local) {
    const stored = await addLocalRequest(requester.email, 'SUBSCRIPTION', summaryRows(answers, apiTitle, requester));
    logger.info(`Access request stored locally as ${stored.reference}: the requester is not known to the backend`);
    return { ok: true, reference: stored.reference };
  }

  return postSubmission(
    logger,
    'Access request',
    `for ${answers['api-name']} by user ${requester.id}`,
    SUBSCRIPTIONS_PATH,
    requester.id,
    {
      apiShortCode: answers['api-name'],
      api: apiTitle || answers['api-name'],
      environment: ENVIRONMENT_NOT_ASKED,
      expectedVolume: answers['call-volume'],
      useCase: answers['use-case'],
      // The form no longer asks about OAuth capability or carries declarations, but the
      // backend refuses a body with no oauth2Capable at all — not a validation error but an
      // unreadable-request 400 — so both are still sent: the capability as true, as every
      // HMCTS API requires OAuth 2.0, and the declaration marked as never asked. Drop them
      // once the backend stops requiring them.
      oauth2Capable: true,
      declaration: DECLARATION_NOT_ASKED,
    }
  );
}

function requireChoice(errors: FieldError[], name: string, value: string, choices: Choice[], text: string): void {
  if (!choices.some(choice => choice.value === value)) {
    errors.push({ name, text });
  }
}

function labelFor(choices: Choice[], value: string): string {
  return choices.find(choice => choice.value === value)?.text ?? value;
}
