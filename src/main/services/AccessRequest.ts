import crypto from 'node:crypto';

import { Logger } from '../modules/logging';

const logger = Logger.getLogger('access-request');

export interface Choice {
  value: string;
  text: string;
  hint?: { text: string } | { html: string };
}

export interface FieldError {
  name: string;
  text: string;
}

export interface SummaryRow {
  key: string;
  value: string;
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
  {
    value: 'governance',
    text: 'I have read and accept the Data Governance Standards',
    hint: { html: 'See the <a class="govuk-link" href="/publish/data-governance">Data Governance Standards</a>.' },
  },
];

/** Field names match the prototype's, so the answers keep one shape end to end. */
export interface AccessRequestAnswers {
  'full-name': string;
  organisation: string;
  email: string;
  'job-title': string;
  phone: string;
  'api-name': string;
  environment: string;
  'call-volume': string;
  'use-case': string;
  oauth: string;
  declarations: string[];
}

export const ANSWER_FIELDS: (keyof AccessRequestAnswers)[] = [
  'full-name',
  'organisation',
  'email',
  'job-title',
  'phone',
  'api-name',
  'environment',
  'call-volume',
  'use-case',
  'oauth',
  'declarations',
];

export function toAnswers(body: Record<string, unknown> = {}): AccessRequestAnswers {
  // Only strings count. A JSON body can carry an object or an array under any of these
  // names, and String()-ing one would produce "[object Object]" and pass validation.
  const text = (name: string) => (typeof body?.[name] === 'string' ? (body[name] as string).trim() : '');

  return {
    'full-name': text('full-name'),
    organisation: text('organisation'),
    email: text('email'),
    'job-title': text('job-title'),
    phone: text('phone'),
    'api-name': text('api-name'),
    environment: text('environment'),
    'call-volume': text('call-volume'),
    'use-case': text('use-case'),
    oauth: text('oauth'),
    declarations: toList(body?.declarations),
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

  require('full-name', 'Enter your full name');
  require('organisation', 'Enter your organisation');

  if (!answers.email) {
    errors.push({ name: 'email', text: 'Enter your work email address' });
  } else if (!looksLikeAnEmailAddress(answers.email)) {
    errors.push({ name: 'email', text: 'Enter a work email address in the correct format, like name@example.gov.uk' });
  }

  require('job-title', 'Enter your job title');

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

/** The rows shown on the check-answers page, with stored values turned back into their labels. */
export function summaryRows(answers: AccessRequestAnswers, apiTitle: string): SummaryRow[] {
  return [
    { key: 'Full name', value: answers['full-name'] },
    { key: 'Organisation', value: answers.organisation },
    { key: 'Work email address', value: answers.email },
    { key: 'Job title', value: answers['job-title'] },
    { key: 'Phone number', value: answers.phone || 'Not provided' },
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
export async function submitAccessRequest(answers: AccessRequestAnswers): Promise<string> {
  const reference = newReference();

  logger.info(
    `Access request ${reference} for ${answers['api-name']} (${answers.environment}) was not persisted: no backend endpoint yet`
  );

  return reference;
}

/**
 * Deliberately not a regular expression: the obvious one backtracks, and no pattern
 * decides whether an address is real anyway. This rejects the shapes a person could only
 * have typed by mistake, and delivery decides the rest.
 */
function looksLikeAnEmailAddress(value: string): boolean {
  const parts = value.split('@');

  if (parts.length !== 2) {
    return false;
  }

  const [local, domain] = parts;

  return local.length > 0 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

function toList(value: unknown): string[] {
  // Checkboxes arrive as a string when one is ticked and an array when several are, and
  // only string entries are meaningful — anything else is not an answer this form offered.
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' && value !== '' ? [value] : [];
}

function requireChoice(errors: FieldError[], name: string, value: string, choices: Choice[], text: string): void {
  if (!choices.some(choice => choice.value === value)) {
    errors.push({ name, text });
  }
}

function labelFor(choices: Choice[], value: string): string {
  return choices.find(choice => choice.value === value)?.text ?? value;
}

/**
 * Unguessable rather than merely unique: the reference is quoted back to the user and
 * will become the key their request is looked up by, so Math.random() is not good enough.
 */
function newReference(): string {
  return `AMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
