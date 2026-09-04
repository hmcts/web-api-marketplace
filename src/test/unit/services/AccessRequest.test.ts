import axios from 'axios';

import {
  DECLARATIONS,
  submitAccessRequest,
  summaryRows,
  toAnswers,
  validate,
} from '../../../main/services/AccessRequest';

const apiNames = ['api-cp-ai-rag', 'api-cp-crime-court-list-publisher'];

const REQUESTER = {
  id: 1,
  firstName: 'Joe',
  lastName: 'Bloggs',
  email: 'joe.bloggs@justice.gov.uk',
  orgName: 'HMCTS DTS',
};

const completeBody = {
  'api-name': 'api-cp-ai-rag',
  environment: 'sandbox',
  'call-volume': 'low',
  'use-case': 'Ingesting documents for the case bundle service.',
  oauth: 'yes',
  declarations: DECLARATIONS.map(declaration => declaration.value),
};

jest.mock('axios');

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe('AccessRequest', () => {
  beforeEach(() => mockedPost.mockReset());

  test('a_complete_submission_should_produce_no_errors', () => {
    expect(validate(toAnswers(completeBody), apiNames)).toEqual([]);
  });

  test('an_empty_submission_should_report_every_required_field_in_form_order', () => {
    const errors = validate(toAnswers({}), apiNames);

    expect(errors.map(error => error.name)).toEqual([
      'api-name',
      'environment',
      'call-volume',
      'use-case',
      'oauth',
      'declarations',
    ]);
  });

  test('an_api_that_is_not_in_the_catalogue_should_be_rejected', () => {
    const errors = validate(toAnswers({ ...completeBody, 'api-name': 'api-that-does-not-exist' }), apiNames);

    expect(errors).toEqual([{ name: 'api-name', text: 'Select the API you need access to' }]);
  });

  test('a_choice_outside_the_offered_options_should_be_rejected', () => {
    const errors = validate(toAnswers({ ...completeBody, environment: 'staging' }), apiNames);

    expect(errors).toEqual([{ name: 'environment', text: 'Select the environment you need' }]);
  });

  test('confirming_only_some_declarations_should_be_rejected', () => {
    const errors = validate(toAnswers({ ...completeBody, declarations: ['in-scope', 'oauth-ready'] }), apiNames);

    expect(errors).toEqual([{ name: 'declarations', text: 'You must confirm all four declarations' }]);
  });

  test('a_single_checked_declaration_should_be_read_as_a_list_not_a_string', () => {
    expect(toAnswers({ declarations: 'in-scope' }).declarations).toEqual(['in-scope']);
  });

  test('a_non_string_declaration_should_be_discarded_rather_than_stringified', () => {
    expect(toAnswers({ declarations: [{ toString: () => 'in-scope' }] }).declarations).toEqual([]);
  });

  test('surrounding_whitespace_should_be_trimmed_from_text_answers', () => {
    expect(toAnswers({ ...completeBody, 'use-case': '  Ingesting documents.  ' })['use-case']).toBe(
      'Ingesting documents.'
    );
  });

  test('the_requester_should_come_from_the_session_and_not_from_the_posted_body', () => {
    // Whatever the body claims, the answers carry no identity at all — so a hidden field
    // cannot be edited to submit a request in someone else's name.
    const answers = toAnswers({ ...completeBody, 'full-name': 'Someone Else', email: 'else@example.com' });

    expect(Object.keys(answers)).not.toContain('full-name');
    expect(Object.keys(answers)).not.toContain('email');
  });

  test('the_summary_should_name_the_signed_in_requester', () => {
    const rows = summaryRows(toAnswers(completeBody), 'RAG Service API', REQUESTER);
    const valueFor = (key: string) => rows.find(row => row.key === key)?.value;

    expect(valueFor('Name')).toBe('Joe Bloggs');
    expect(valueFor('Organisation')).toBe('HMCTS DTS');
    expect(valueFor('Email')).toBe('joe.bloggs@justice.gov.uk');
  });

  test('the_summary_should_show_labels_rather_than_stored_values', () => {
    const rows = summaryRows(toAnswers(completeBody), 'RAG Service API', REQUESTER);
    const valueFor = (key: string) => rows.find(row => row.key === key)?.value;

    expect(valueFor('API')).toBe('RAG Service API');
    expect(valueFor('Environment')).toBe('Sandbox (development and testing)');
    expect(valueFor('Expected call volume')).toBe('Low');
    expect(valueFor('OAuth 2.0 with JWT bearer tokens')).toBe('Yes');
  });

  test('submitting_a_request_should_send_the_user_id_as_a_header_and_not_the_identity', async () => {
    mockedPost.mockResolvedValue({ status: 201, data: { reference: 'AR-2026-IPCOC1' } });

    const result = await submitAccessRequest(toAnswers(completeBody), REQUESTER, 'RAG Service API');

    expect(result).toEqual({ ok: true, reference: 'AR-2026-IPCOC1' });

    const [, body, options] = mockedPost.mock.calls[0];
    expect((options as { headers: Record<string, string> }).headers.requestingUserId).toBe('1');
    // The backend derives these from the user id, so sending them would offer it a second,
    // forgeable copy of what it already knows.
    expect(JSON.stringify(body)).not.toContain(REQUESTER.email);
    expect(JSON.stringify(body)).not.toContain('Bloggs');
  });

  test('submitting_a_request_should_map_the_answers_onto_the_backend_fields', async () => {
    mockedPost.mockResolvedValue({ status: 201, data: { reference: 'AR-2026-ABC123' } });

    await submitAccessRequest(toAnswers(completeBody), REQUESTER, 'RAG Service API');

    expect(mockedPost.mock.calls[0][1]).toEqual({
      apiShortCode: 'api-cp-ai-rag',
      api: 'RAG Service API',
      environment: 'sandbox',
      expectedVolume: 'low',
      useCase: 'Ingesting documents for the case bundle service.',
      oauth2Capable: true,
      declaration: DECLARATIONS.map(declaration => declaration.value).join(', '),
    });
  });

  test('a_rejected_submission_should_report_failure_rather_than_a_reference', async () => {
    mockedPost.mockResolvedValue({ status: 400, data: { error: 'useCase is required.' } });

    expect(await submitAccessRequest(toAnswers(completeBody), REQUESTER, 'RAG Service API')).toEqual({ ok: false });
  });

  test('an_unreachable_backend_should_report_failure_rather_than_throwing', async () => {
    mockedPost.mockRejectedValue(new Error('connect ECONNREFUSED'));

    expect(await submitAccessRequest(toAnswers(completeBody), REQUESTER, 'RAG Service API')).toEqual({ ok: false });
  });

  test('a_use_case_longer_than_the_backend_allows_should_be_rejected_on_the_form', () => {
    const errors = validate(toAnswers({ ...completeBody, 'use-case': 'x'.repeat(256) }), apiNames);

    expect(errors).toEqual([{ name: 'use-case', text: 'Your description must be 255 characters or fewer' }]);
  });
});
