import {
  DECLARATIONS,
  submitAccessRequest,
  summaryRows,
  toAnswers,
  validate,
} from '../../../main/services/AccessRequest';

const apiNames = ['api-cp-ai-rag', 'api-cp-crime-court-list-publisher'];

const completeBody = {
  'full-name': ' Joe Bloggs ',
  organisation: 'HMCTS DTS',
  email: 'joe.bloggs@justice.gov.uk',
  'job-title': 'Senior Developer',
  phone: '',
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
      'full-name',
      'organisation',
      'email',
      'job-title',
      'api-name',
      'environment',
      'call-volume',
      'use-case',
      'oauth',
      'declarations',
    ]);
  });

  test('an_optional_phone_number_should_not_be_required', () => {
    const errors = validate(toAnswers({ ...completeBody, phone: '' }), apiNames);

    expect(errors.map(error => error.name)).not.toContain('phone');
  });

  test('an_email_without_an_at_sign_should_be_rejected_as_the_wrong_format', () => {
    const errors = validate(toAnswers({ ...completeBody, email: 'not-an-address' }), apiNames);

    expect(errors).toEqual([
      { name: 'email', text: 'Enter a work email address in the correct format, like name@example.gov.uk' },
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

  test('surrounding_whitespace_should_be_trimmed_from_text_answers', () => {
    expect(toAnswers(completeBody)['full-name']).toBe('Joe Bloggs');
  });

  test('the_summary_should_show_labels_rather_than_stored_values', () => {
    const rows = summaryRows(toAnswers(completeBody), 'RAG Service API');
    const valueFor = (key: string) => rows.find(row => row.key === key)?.value;

    expect(valueFor('API')).toBe('RAG Service API');
    expect(valueFor('Environment')).toBe('Sandbox (development and testing)');
    expect(valueFor('Expected call volume')).toBe('Low');
    expect(valueFor('OAuth 2.0 with JWT bearer tokens')).toBe('Yes');
  });

  test('a_missing_phone_number_should_be_summarised_as_not_provided', () => {
    const rows = summaryRows(toAnswers(completeBody), 'RAG Service API');

    expect(rows.find(row => row.key === 'Phone number')?.value).toBe('Not provided');
  });

  test('submitting_a_request_should_return_a_reference', async () => {
    const reference = await submitAccessRequest(toAnswers(completeBody));

    expect(reference).toMatch(/^AMP-[0-9A-Z]{1,6}$/);
  });
});
