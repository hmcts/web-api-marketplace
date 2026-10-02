import { Logger } from '../modules/logging';

const logger = Logger.getLogger('notify');

/**
 * The emails the onboarding journeys send. Named after the GOV.UK Notify templates they
 * will become, so wiring Notify in is a template id per entry rather than a rewrite.
 */
export type EmailTemplate =
  'verify-email' | 'already-registered' | 'email-verified' | 'reset-password' | 'production-request-received';

export interface Email {
  template: EmailTemplate;
  to: string;
  subject: string;
  paragraphs: string[];
  /** A link the reader must follow, such as the one that verifies their address. */
  link?: { text: string; href: string };
}

/**
 * Stands in for GOV.UK Notify, which has no API key or approved templates for this
 * service yet.
 *
 * Nothing leaves the service. The email is logged without its link — a verification or
 * reset link is as good as a password for the minutes it is valid — and handed back so
 * the page that follows can show it, where configuration allows (see
 * notify.showEmailsOnPage). Without that, nobody could finish registering on an
 * environment where no email is ever sent.
 */
export function sendEmail(email: Email): Email {
  logger.info(`GOV.UK Notify is not connected: "${email.template}" email to ${mask(email.to)} was not sent`);
  return email;
}

/** Enough of the address to tell two test accounts apart in a log, and no more. */
function mask(address: string): string {
  const [local, domain] = address.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}
