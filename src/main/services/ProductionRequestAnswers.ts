import { ProductionRequestDetail } from './ProductionRequests';
import { SummaryRow } from './answers';

/** What a production request expects to send, in calls per day. */
export const CALL_VOLUMES = [
  { value: 'low', text: 'Low', hint: { text: 'Under 1,000 calls per day' } },
  { value: 'medium', text: 'Medium', hint: { text: '1,000 to 100,000 calls per day' } },
  { value: 'high', text: 'High', hint: { text: 'Over 100,000 calls per day' } },
];

/** "Organisation", which helps the Data Access Team triage a request. */
export const ORGANISATION_TYPES = [
  { value: 'hmcts', text: 'HMCTS' },
  { value: 'moj', text: 'Ministry of Justice' },
  { value: 'other-government', text: 'Other government department/public body' },
  { value: 'external', text: 'Other external organisation' },
];

/**
 * "Who will have access to, or receive, the data?". Any number of options can be chosen. Choosing
 * only the first means nobody else receives the data, so nothing needs explaining; choosing any
 * other option, with or without the first, asks for an explanation.
 */
export const OWN_TEAM_ONLY = 'own-team';
export const DATA_RECIPIENTS = [
  { value: OWN_TEAM_ONLY, text: 'Me/my immediate team only' },
  { value: 'other-hmcts', text: 'Other HMCTS teams' },
  { value: 'wider-moj', text: 'Wider MOJ' },
  { value: 'other-government', text: 'Another government department/public body' },
  { value: 'supplier', text: 'Supplier/contract/delivery partner' },
  { value: 'external', text: 'Other external organisation' },
  { value: 'public', text: 'The data will be published or used in a public-facing service' },
];

/** "Will you combine or link the API data with other data?". Yes or Unsure asks what it is combined with. */
export const DATA_COMBINED = [
  { value: 'no', text: 'No' },
  { value: 'yes', text: 'Yes' },
  { value: 'unsure', text: 'Unsure' },
];

/** The text an option is shown as; a value no option has is shown as it was stored. */
export function answerLabel(options: { value: string; text: string }[], value: string): string {
  return options.find(option => option.value === value)?.text ?? value;
}

type StoredAnswers = Pick<
  ProductionRequestDetail,
  | 'goLiveDate'
  | 'callVolume'
  | 'dataRequest'
  | 'dataRecipients'
  | 'dataRecipientsExplanation'
  | 'dataCombined'
  | 'dataCombinedDescription'
  | 'proposedOutputs'
>;

/**
 * A stored request's answers about the data, as rows. Every triage answer is optional: requests
 * made before the questions were added carry none of them, and proposedOutputs is the one they
 * carry instead.
 */
export function storedAnswerRows(request: StoredAnswers): SummaryRow[] {
  return [
    { key: 'Go-live date', value: formatDay(request.goLiveDate) },
    { key: 'Expected call volume', value: answerLabel(CALL_VOLUMES, request.callVolume) },
    ...(request.dataRequest ? [{ key: 'Data request', value: request.dataRequest }] : []),
    ...(request.dataRecipients?.length
      ? [
          {
            key: 'Who will have access to, or receive, the data?',
            value: request.dataRecipients.map(value => answerLabel(DATA_RECIPIENTS, value)).join(', '),
          },
        ]
      : []),
    ...(request.dataRecipientsExplanation
      ? [{ key: 'Who will receive the data and why', value: request.dataRecipientsExplanation }]
      : []),
    ...(request.dataCombined
      ? [
          {
            key: 'Will you combine or link the API data with other data?',
            value: answerLabel(DATA_COMBINED, request.dataCombined),
          },
        ]
      : []),
    ...(request.dataCombinedDescription
      ? [{ key: 'Other data and what the combined data will be used for', value: request.dataCombinedDescription }]
      : []),
    ...(request.proposedOutputs ? [{ key: 'Proposed outputs', value: request.proposedOutputs }] : []),
  ];
}

/** A go-live date is a day, not a moment: formatted in UTC so it never moves a day either way. */
function formatDay(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date
  );
}
