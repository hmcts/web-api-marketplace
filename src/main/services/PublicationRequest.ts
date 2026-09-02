import { Logger } from '../modules/logging';

import {
  Choice,
  FieldError,
  SummaryRow,
  looksLikeAnEmailAddress,
  newReference,
  toAnswerList,
  toAnswerText,
} from './answers';

const logger = Logger.getLogger('publication-request');

export const CLASSIFICATIONS: Choice[] = [
  { value: 'official', text: 'Official' },
  {
    value: 'official-sensitive',
    text: 'Official-Sensitive',
    hint: { text: 'A formal data sharing agreement will be required.' },
  },
  { value: 'secret', text: 'Secret or Top Secret', hint: { text: 'Not eligible for listing.' } },
];

/** Offered on the form so the answer can be given honestly, but rejected on submission. */
export const INELIGIBLE_CLASSIFICATION = 'secret';

export const PUBLISH_DECLARATIONS: Choice[] = [
  { value: 'public-repo', text: 'The API repository is public on GitHub under the HMCTS organisation' },
  { value: 'spectral', text: 'The specification passes the standard Spectral OAS3 ruleset with no errors' },
  { value: 'external', text: 'This is an external API, not an internal or developers-only API' },
];

/** Field names match the prototype's, so the answers keep one shape end to end. */
export interface PublicationRequestAnswers {
  'api-name': string;
  'owning-team': string;
  'contact-email': string;
  'spec-url': string;
  classification: string;
  declarations: string[];
}

export function toPublicationAnswers(body: Record<string, unknown> = {}): PublicationRequestAnswers {
  return {
    'api-name': toAnswerText(body, 'api-name'),
    'owning-team': toAnswerText(body, 'owning-team'),
    'contact-email': toAnswerText(body, 'contact-email'),
    'spec-url': toAnswerText(body, 'spec-url'),
    classification: toAnswerText(body, 'classification'),
    declarations: toAnswerList(body?.declarations),
  };
}

export function validatePublication(answers: PublicationRequestAnswers): FieldError[] {
  const errors: FieldError[] = [];

  if (!answers['api-name']) {
    errors.push({ name: 'api-name', text: 'Enter the name of your API' });
  }
  if (!answers['owning-team']) {
    errors.push({ name: 'owning-team', text: 'Enter the team that owns the API' });
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
  }

  if (!CLASSIFICATIONS.some(choice => choice.value === answers.classification)) {
    errors.push({ name: 'classification', text: 'Select the highest data classification the API returns' });
  } else if (answers.classification === INELIGIBLE_CLASSIFICATION) {
    // The page says these cannot be listed, so the form has to say so too rather than
    // accepting the submission and leaving someone to find out later.
    errors.push({
      name: 'classification',
      text: 'APIs classified Secret or Top Secret cannot be listed in the marketplace',
    });
  }

  if (!PUBLISH_DECLARATIONS.every(declaration => answers.declarations.includes(declaration.value))) {
    errors.push({ name: 'declarations', text: 'You must confirm all three declarations' });
  }

  return errors;
}

export function publicationSummaryRows(answers: PublicationRequestAnswers): SummaryRow[] {
  const classification = CLASSIFICATIONS.find(choice => choice.value === answers.classification);

  return [
    { key: 'API name', value: answers['api-name'] },
    { key: 'Owning team', value: answers['owning-team'] },
    { key: 'Team contact email', value: answers['contact-email'] },
    { key: 'OpenAPI specification URL', value: answers['spec-url'] },
    { key: 'Data classification', value: classification?.text ?? answers.classification },
    { key: 'Declarations', value: `All ${PUBLISH_DECLARATIONS.length} confirmed` },
  ];
}

/**
 * Records the submission and returns the reference shown on the confirmation page.
 *
 * As with an access request, nothing is persisted yet — this is the seam that a POST to
 * service-api-marketplace replaces once there is an endpoint to publish to.
 */
export async function submitPublicationRequest(answers: PublicationRequestAnswers): Promise<string> {
  const reference = newReference();

  logger.info(
    `Publication request ${reference} for ${answers['api-name']} from ${answers['owning-team']} was not persisted: no backend endpoint yet`
  );

  return reference;
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
