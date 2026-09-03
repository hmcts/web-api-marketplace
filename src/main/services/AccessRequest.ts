import axios from 'axios';

import { Logger } from '../modules/logging';

import { Choice, FieldError, SummaryRow, toAnswerList, toAnswerText } from './answers';
import { logSubmission, submissionEndpoint } from './submissions';

// Re-exported so importers that predate services/answers keep working unchanged.
export type { Choice, FieldError, SummaryRow };

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

const logger = Logger.getLogger('access-request');

/** The backend stores an access request as a subscription. */
const SUBSCRIPTIONS_PATH = '/subscriptions';

/** Matches the backend's own limit, so an over-long description fails on the form. */
export const USE_CASE_MAX_LENGTH = 255;

export interface SubmitResult {
  ok: boolean;
  reference?: string;
}

/**
 * The fixed answer lists, held here rather than in the template so that validation, the
 * form and the check-answers summary all read the same source. The catalogue list is not
 * here — it comes from the live feed, see ApiCatalogue.
 */
export const ENVIRONMENTS: Choice[] = [
  { value: 'sandbox', text: 'Sandbox (development and testing)' },
  { value: 'production', text: 'Production' },
  { value: 'both', text: 'Both sandbox and production' },
];

export const CALL_VOLUMES: Choice[] = [
  { value: 'low', text: 'Low', hint: { text: 'Under 1,000 calls per day' } },
  { value: 'medium', text: 'Medium', hint: { text: '1,000 to 100,000 calls per day' } },
  { value: 'high', text: 'High', hint: { text: 'Over 100,000 calls per day' } },
];

export const OAUTH_ANSWERS: Choice[] = [
  { value: 'yes', text: 'Yes' },
  { value: 'no', text: 'No - I need guidance' },
];

export const DECLARATIONS: Choice[] = [
  {
    value: 'in-scope',
    text: 'I confirm my use case is within the intended scope of this API and I am not requesting access speculatively',
  },
  {
    value: 'oauth-ready',
    text: 'My system can implement OAuth 2.0 with JWT bearer tokens, or I have said I need guidance',
  },
  {
    value: 'dsa-dpa',
    text: 'A Data Sharing Agreement or Data Processing Agreement is in place or being arranged for APIs containing personal data',
  },
  // The Data Governance Standards page was dropped with the rest of the static content,
  // so this declaration no longer links anywhere. Anyone ticking it is accepting a
  // document this service does not publish — worth restoring a link to wherever the
  // standards actually live before this is asked of real users.
  { value: 'governance', text: 'I have read and accept the Data Governance Standards' },
];

/**
 * What the form asks for. The requester is not in here: their name, organisation and
 * email come from the signed-in session, so they cannot be posted and cannot be edited
 * into someone else's.
 */
export interface AccessRequestAnswers {
  'api-name': string;
  environment: string;
  'call-volume': string;
  'use-case': string;
  oauth: string;
  declarations: string[];
}

export const ANSWER_FIELDS: (keyof AccessRequestAnswers)[] = [
  'api-name',
  'environment',
  'call-volume',
  'use-case',
  'oauth',
  'declarations',
];

export function toAnswers(body: Record<string, unknown> = {}): AccessRequestAnswers {
  const text = (name: string) => toAnswerText(body, name);

  return {
    'api-name': text('api-name'),
    environment: text('environment'),
    'call-volume': text('call-volume'),
    'use-case': text('use-case'),
    oauth: text('oauth'),
    declarations: toAnswerList(body?.declarations),
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

  requireChoice(errors, 'environment', answers.environment, ENVIRONMENTS, 'Select the environment you need');
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
  requireChoice(
    errors,
    'oauth',
    answers.oauth,
    OAUTH_ANSWERS,
    'Select whether your system can implement OAuth 2.0 with JWT bearer tokens'
  );

  if (!DECLARATIONS.every(declaration => answers.declarations.includes(declaration.value))) {
    errors.push({ name: 'declarations', text: 'You must confirm all four declarations' });
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
    { key: 'Name', value: `${requester.firstName} ${requester.lastName}` },
    { key: 'Organisation', value: requester.orgName },
    { key: 'Email', value: requester.email },
    { key: 'API', value: apiTitle || answers['api-name'] },
    { key: 'Environment', value: labelFor(ENVIRONMENTS, answers.environment) },
    { key: 'Expected call volume', value: labelFor(CALL_VOLUMES, answers['call-volume']) },
    { key: 'Use case', value: answers['use-case'] },
    { key: 'OAuth 2.0 with JWT bearer tokens', value: labelFor(OAUTH_ANSWERS, answers.oauth) },
    { key: 'Declarations', value: `All ${DECLARATIONS.length} confirmed` },
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
  const url = submissionEndpoint(SUBSCRIPTIONS_PATH);
  const body = {
    apiShortCode: answers['api-name'],
    api: apiTitle || answers['api-name'],
    environment: answers.environment,
    expectedVolume: answers['call-volume'],
    useCase: answers['use-case'],
    oauth2Capable: answers.oauth === 'yes',
    declaration: answers.declarations.join(', '),
  };

  logSubmission(logger, `Access request for ${answers['api-name']} by user ${requester.id}`, SUBSCRIPTIONS_PATH);

  try {
    const response = await axios.post(url, body, {
      timeout: 10000,
      validateStatus: () => true,
      headers: { requestingUserId: String(requester.id) },
    });

    if (response.status === 201) {
      const reference = String((response.data as { id?: string })?.id ?? '');
      logger.info(`Access request stored as ${reference} at ${url}`);
      return { ok: true, reference };
    }

    logger.error(`Access request rejected with status ${response.status} from ${url}`);
    return { ok: false };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Access request to ${url} failed: ${detail}`);
    return { ok: false };
  }
}

function requireChoice(errors: FieldError[], name: string, value: string, choices: Choice[], text: string): void {
  if (!choices.some(choice => choice.value === value)) {
    errors.push({ name, text });
  }
}

function labelFor(choices: Choice[], value: string): string {
  return choices.find(choice => choice.value === value)?.text ?? value;
}
