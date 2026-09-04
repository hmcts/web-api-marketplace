import axios from 'axios';

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

jest.mock('axios');

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

const REQUESTER = {
  id: 1,
  firstName: 'Joe',
  lastName: 'Bloggs',
  email: 'joe.bloggs@justice.gov.uk',
  orgName: 'HMCTS DTS',
};

describe('PublicationRequest', () => {
  beforeEach(() => mockedPost.mockReset());

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

  test('submitting_should_send_the_user_id_as_a_header_and_not_the_identity', async () => {
    mockedPost.mockResolvedValue({ status: 201, data: { reference: 'PR-2026-E9PDKA' } });

    const result = await submitPublicationRequest(toPublicationAnswers(completeBody), REQUESTER);

    expect(result).toEqual({ ok: true, reference: 'PR-2026-E9PDKA' });

    const [, body, options] = mockedPost.mock.calls[0];
    expect((options as { headers: Record<string, string> }).headers.requestingUserId).toBe('1');
    // The backend derives these from the user id, so sending them would offer it a second,
    // forgeable copy of what it already knows.
    expect(JSON.stringify(body)).not.toContain(REQUESTER.email);
    expect(JSON.stringify(body)).not.toContain('Bloggs');
  });

  test('submitting_should_map_the_answers_onto_the_backend_fields', async () => {
    mockedPost.mockResolvedValue({ status: 201, data: { reference: 'PR-2026-ABC123' } });

    await submitPublicationRequest(toPublicationAnswers(completeBody), REQUESTER);

    expect(mockedPost.mock.calls[0][1]).toEqual({
      apiName: 'Court Schedule',
      owningTeam: 'Scheduling and Listing',
      contactEmail: 'sandl-api@justice.gov.uk',
      specUrl: 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
    });
  });

  test('a_rejected_submission_should_report_failure_rather_than_a_reference', async () => {
    mockedPost.mockResolvedValue({ status: 400, data: { error: 'apiName is required.' } });

    expect(await submitPublicationRequest(toPublicationAnswers(completeBody), REQUESTER)).toEqual({ ok: false });
  });

  test('an_unreachable_backend_should_report_failure_rather_than_throwing', async () => {
    mockedPost.mockRejectedValue(new Error('connect ECONNREFUSED'));

    expect(await submitPublicationRequest(toPublicationAnswers(completeBody), REQUESTER)).toEqual({ ok: false });
  });

  test.each([
    ['api-name', 'The API name must be 255 characters or fewer'],
    ['owning-team', 'The owning team must be 255 characters or fewer'],
  ])('an_over_long_%s_should_be_rejected_on_the_form', (field: string, message: string) => {
    // The backend caps these, so catching it here is a field error rather than a failed
    // submission the user cannot act on.
    const errors = validatePublication(toPublicationAnswers({ ...completeBody, [field]: 'x'.repeat(256) }));

    expect(errors).toEqual([{ name: field, text: message }]);
  });

  test('an_over_long_specification_url_should_be_rejected_on_the_form', () => {
    const specUrl = 'https://example.gov.uk/' + 'x'.repeat(2048);
    const errors = validatePublication(toPublicationAnswers({ ...completeBody, 'spec-url': specUrl }));

    expect(errors).toEqual([{ name: 'spec-url', text: 'The specification URL must be 2048 characters or fewer' }]);
  });
});
