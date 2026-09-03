import {
  publicationSummaryRows,
  submitPublicationRequest,
  toPublicationAnswers,
  validatePublication,
} from '../../../main/services/PublicationRequest';

const completeBody = {
  'api-name': ' Court Schedule ',
  'owning-team': 'Scheduling and Listing',
  'contact-email': 'sandl-api@justice.gov.uk',
  'spec-url': 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
};

describe('PublicationRequest', () => {
  test('a_complete_submission_should_produce_no_errors', () => {
    expect(validatePublication(toPublicationAnswers(completeBody))).toEqual([]);
  });

  test('an_empty_submission_should_report_every_required_field_in_form_order', () => {
    const errors = validatePublication(toPublicationAnswers({}));

    expect(errors.map(error => error.name)).toEqual(['api-name', 'owning-team', 'contact-email', 'spec-url']);
  });

  test.each([['not-a-url'], ['raw.githubusercontent.com/hmcts/x/openapi.yml'], ['ftp://example.gov.uk/spec.yml']])(
    'a_specification_url_of_%s_should_be_rejected',
    (specUrl: string) => {
      const errors = validatePublication(toPublicationAnswers({ ...completeBody, 'spec-url': specUrl }));

      expect(errors).toEqual([
        { name: 'spec-url', text: 'Enter the specification URL in full, starting with https://' },
      ]);
    }
  );

  test('a_team_inbox_in_the_wrong_format_should_be_rejected', () => {
    const errors = validatePublication(toPublicationAnswers({ ...completeBody, 'contact-email': 'not-an-inbox' }));

    expect(errors.map(error => error.name)).toEqual(['contact-email']);
  });

  test('surrounding_whitespace_should_be_trimmed_from_text_answers', () => {
    expect(toPublicationAnswers(completeBody)['api-name']).toBe('Court Schedule');
  });

  test('the_summary_should_list_the_four_answers_the_form_asks_for', () => {
    const rows = publicationSummaryRows(toPublicationAnswers(completeBody));

    expect(rows.map(row => row.key)).toEqual([
      'API name',
      'Owning team',
      'Team contact email',
      'OpenAPI specification URL',
    ]);
  });

  test('submitting_a_publication_request_should_return_a_reference', async () => {
    expect(await submitPublicationRequest(toPublicationAnswers(completeBody))).toMatch(/^AMP-[0-9A-F]{8}$/);
  });
});
