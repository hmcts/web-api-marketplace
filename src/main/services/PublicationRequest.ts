import { Logger } from '../modules/logging';

import { FieldError, SummaryRow, looksLikeAnEmailAddress, newReference, toAnswerText } from './answers';
import { logNotImplemented } from './submissions';

const logger = Logger.getLogger('publication-request');

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
 * Records the submission and returns the reference shown on the confirmation page.
 *
 * As with an access request, nothing is persisted yet — this is the seam that a POST to
 * service-api-marketplace replaces once there is an endpoint to publish to.
 */
export async function submitPublicationRequest(answers: PublicationRequestAnswers): Promise<string> {
  const reference = newReference();

  logNotImplemented(
    logger,
    'Publication request',
    `${reference} for ${answers['api-name']}, ${answers['owning-team']}`
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
