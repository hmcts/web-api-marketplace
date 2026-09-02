import {
  PUBLISH_DECLARATIONS,
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
  classification: 'official',
  declarations: PUBLISH_DECLARATIONS.map(declaration => declaration.value),
};

describe('PublicationRequest', () => {
  test('a_complete_submission_should_produce_no_errors', () => {
    expect(validatePublication(toPublicationAnswers(completeBody))).toEqual([]);
  });

  test('an_empty_submission_should_report_every_required_field_in_form_order', () => {
    const errors = validatePublication(toPublicationAnswers({}));

    expect(errors.map(error => error.name)).toEqual([
      'api-name',
      'owning-team',
      'contact-email',
      'spec-url',
      'classification',
      'declarations',
    ]);
  });

  test('a_secret_classification_should_be_rejected_because_it_cannot_be_listed', () => {
    // The form offers the option so the answer can be given honestly, and then says no.
    const errors = validatePublication(toPublicationAnswers({ ...completeBody, classification: 'secret' }));

    expect(errors).toEqual([
      {
        name: 'classification',
        text: 'APIs classified Secret or Top Secret cannot be listed in the marketplace',
      },
    ]);
  });

  test('an_official_sensitive_classification_should_be_accepted', () => {
    expect(
      validatePublication(toPublicationAnswers({ ...completeBody, classification: 'official-sensitive' }))
    ).toEqual([]);
  });

  test('a_classification_outside_the_offered_options_should_be_rejected', () => {
    const errors = validatePublication(toPublicationAnswers({ ...completeBody, classification: 'restricted' }));

    expect(errors).toEqual([
      { name: 'classification', text: 'Select the highest data classification the API returns' },
    ]);
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

  test('confirming_only_some_declarations_should_be_rejected', () => {
    const errors = validatePublication(toPublicationAnswers({ ...completeBody, declarations: ['public-repo'] }));

    expect(errors).toEqual([{ name: 'declarations', text: 'You must confirm all three declarations' }]);
  });

  test('surrounding_whitespace_should_be_trimmed_from_text_answers', () => {
    expect(toPublicationAnswers(completeBody)['api-name']).toBe('Court Schedule');
  });

  test('the_summary_should_show_the_classification_label_rather_than_its_stored_value', () => {
    const rows = publicationSummaryRows(
      toPublicationAnswers({ ...completeBody, classification: 'official-sensitive' })
    );

    expect(rows.find(row => row.key === 'Data classification')?.value).toBe('Official-Sensitive');
    expect(rows.find(row => row.key === 'Declarations')?.value).toBe('All 3 confirmed');
  });

  test('submitting_a_publication_request_should_return_a_reference', async () => {
    expect(await submitPublicationRequest(toPublicationAnswers(completeBody))).toMatch(/^AMP-[0-9A-F]{8}$/);
  });
});
