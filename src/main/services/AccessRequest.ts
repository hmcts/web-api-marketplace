import { Logger } from '../modules/logging';

import { Choice, FieldError, SummaryRow, newReference, toAnswerList, toAnswerText } from './answers';
import { logNotImplemented } from './submissions';

// Re-exported so importers that predate services/answers keep working unchanged.
export type { Choice, FieldError, SummaryRow };

/**
 * Who is asking. Taken from the signed-in session, never from the request body, so a
 * request cannot be submitted in someone else's name by editing a hidden field.
 */
export interface Requester {
  firstName: string;
  lastName: string;
  email: string;
  orgName: string;
}

const logger = Logger.getLogger('access-request');

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
  const require = (name: keyof AccessRequestAnswers, text: string) => {
    if (!answers[name]) {
      errors.push({ name, text });
    }
  };

  if (!answers['api-name'] || !apiNames.includes(answers['api-name'])) {
    errors.push({ name: 'api-name', text: 'Select the API you need access to' });
  }

  requireChoice(errors, 'environment', answers.environment, ENVIRONMENTS, 'Select the environment you need');
  requireChoice(errors, 'call-volume', answers['call-volume'], CALL_VOLUMES, 'Select the expected call volume');
  require('use-case', 'Describe what you are building and why you need this API');
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
 * Records the request and returns the reference shown on the confirmation page.
 *
 * AMP-1071 step 1 stops here: nothing is persisted yet. Step 2 replaces the body of this
 * function with a POST to service-api-marketplace, and everything above it — the pages,
 * the validation and the answer shape — stays as it is.
 */
export async function submitAccessRequest(answers: AccessRequestAnswers, requester: Requester): Promise<string> {
  const reference = newReference();

  logNotImplemented(
    logger,
    'Access request',
    `${reference} from ${requester.email} for ${answers['api-name']}, ${answers.environment}`
  );

  return reference;
}

function requireChoice(errors: FieldError[], name: string, value: string, choices: Choice[], text: string): void {
  if (!choices.some(choice => choice.value === value)) {
    errors.push({ name, text });
  }
}

function labelFor(choices: Choice[], value: string): string {
  return choices.find(choice => choice.value === value)?.text ?? value;
}
