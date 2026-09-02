import crypto from 'crypto';

/** An option offered by a radio, checkbox or select. */
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
 * Reads one text answer out of a posted body.
 *
 * Only strings count. A JSON body can carry an object or an array under any field name,
 * and String()-ing one would produce "[object Object]" and sail through validation as a
 * perfectly good answer.
 */
export function toAnswerText(body: Record<string, unknown> | undefined, name: string): string {
  const value = body?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reads a checkbox group. Browsers post a single string when one box is ticked and an
 * array when several are; anything that is not a string was not an option we offered.
 */
export function toAnswerList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' && value !== '' ? [value] : [];
}

/**
 * Deliberately not a regular expression: the obvious one backtracks, and no pattern
 * decides whether an address is real anyway. This rejects the shapes a person could only
 * have typed by mistake, and delivery decides the rest.
 */
export function looksLikeAnEmailAddress(value: string): boolean {
  const parts = value.split('@');

  if (parts.length !== 2) {
    return false;
  }

  const [local, domain] = parts;

  return local.length > 0 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/**
 * Unguessable rather than merely unique: a reference is quoted back to the user and will
 * become the key their request is looked up by, so Math.random() is not good enough.
 */
export function newReference(): string {
  return `AMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
