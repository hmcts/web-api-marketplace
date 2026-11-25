/** "29 October 2026". Undefined for no date; a value that is not a date comes back as it was. */
export function formatDate(iso?: string | null): string | undefined {
  if (!iso) {
    return undefined;
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
