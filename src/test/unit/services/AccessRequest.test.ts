import {
  DECLARATIONS,
  submitAccessRequest,
  summaryRows,
  toAnswers,
  validate,
} from '../../../main/services/AccessRequest';

const apiNames = ['api-cp-ai-rag', 'api-cp-crime-court-list-publisher'];

const REQUESTER = { firstName: 'Joe', lastName: 'Bloggs', email: 'joe.bloggs@justice.gov.uk', orgName: 'HMCTS DTS' };

const completeBody = {
  'api-name': 'api-cp-ai-rag',
  environment: 'sandbox',
  'call-volume': 'low',
  'use-case': 'Ingesting documents for the case bundle service.',
  oauth: 'yes',
  declarations: DECLARATIONS.map(declaration => declaration.value),
};

describe('AccessRequest', () => {
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

  test('submitting_a_request_should_return_a_reference', async () => {
    const reference = await submitAccessRequest(toAnswers(completeBody), REQUESTER);

    expect(reference).toMatch(/^AMP-[0-9A-F]{8}$/);
  });
});
