import ProductionCredentialsController from '../../../main/controllers/ProductionCredentialsController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { BackendError } from '../../../main/services/Applications';
import * as LocalRequests from '../../../main/services/LocalRequests';
import { LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/Applications', () => ({
  ...jest.requireActual('../../../main/services/Applications'),
  listApplications: jest.fn(),
}));

jest.mock('../../../main/services/ProductionRequests', () => ({
  submitProductionRequest: jest.fn(),
  getProductionRequest: jest.fn(),
  listProductionRequests: jest.fn(),
}));

const { listApplications } = require('../../../main/services/Applications');
const {
  submitProductionRequest,
  getProductionRequest,
  listProductionRequests,
} = require('../../../main/services/ProductionRequests');

const STORED = {
  reference: 'PCR-ABCD2345',
  status: 'SUBMITTED',
  submittedAt: '2026-10-19T11:00:00',
  applicationName: 'Tracker',
  clientId: 'client-1',
  organisation: 'Analytical Engines Ltd',
  goLiveDate: '2027-04-01',
  callVolume: 'medium',
  dataRequest: 'Hearing outcomes for listed cases.',
  proposedOutputs: 'A weekly outcomes report.',
};

/** A request made since the form began asking the triage questions. */
const TRIAGED = {
  ...STORED,
  proposedOutputs: undefined,
  organisationType: 'external',
  dataRecipients: ['own-team', 'supplier'],
  dataRecipientsExplanation: 'Our delivery partner runs the ingest.',
  dataCombined: 'yes',
  dataCombinedDescription: 'Joined to our own case tracker to measure turnaround.',
};

const APPLICATION = {
  id: 'client-1',
  clientId: 'client-1',
  tenantId: 'tenant-1',
  name: 'Tracker',
  secretHint: 'Uc6',
  secretExpiresAt: '',
  createdAt: '',
  apis: [
    { shortCode: 'one', apiTitle: 'API one', publisherId: 'one', subscriptionName: 'amp-temp-1', subscribedAt: '' },
  ],
  accessGranted: true,
};

const controller = () => new ProductionCredentialsController();

function answers(applicationId: string, change: Record<string, unknown> = {}) {
  return {
    application: applicationId,
    'organisation-type': 'external',
    organisation: 'Analytical Engines Ltd',
    'go-live-day': '1',
    'go-live-month': '4',
    'go-live-year': String(new Date().getFullYear() + 1),
    'call-volume': 'medium',
    'data-request': 'Hearing outcomes, used with court listings to show case workers what happened.',
    'data-recipients': ['own-team'],
    'data-combined': 'no',
    ...change,
  };
}

describe('ProductionCredentialsController', () => {
  let applicationId: string;

  beforeEach(() => {
    useDataStore(new MemoryStore());
    (listApplications as jest.Mock).mockReset().mockResolvedValue([APPLICATION]);
    (listProductionRequests as jest.Mock).mockReset().mockResolvedValue([]);
    (submitProductionRequest as jest.Mock).mockReset();
    applicationId = APPLICATION.id;
  });

  test('a_signed_out_visitor_should_be_sent_to_sign_in', async () => {
    for (const action of ['form', 'save', 'checkAnswers', 'submit'] as const) {
      const res = mockResponse();
      await controller()[action](anonymous(), res);
      expect(res.redirected).toBe('/sign-in');
    }
    const res = mockResponse();
    await controller().view(anonymous({ params: { reference: 'PCR-X' } }), res, jest.fn());
    expect(res.redirected).toBe('/sign-in');
  });

  test('the_form_should_preselect_the_chosen_application', async () => {
    const res = mockResponse();

    await controller().form(asUser({ query: { application: applicationId } }), res);

    expect(res.view).toBe('production-credentials/form');
    expect(res.data?.answers).toMatchObject({ application: applicationId });
    expect((res.data?.applicationItems as { hint: { text: string } }[])[0].hint.text).toBe('1 API');
  });

  test('the_organisation_question_should_offer_only_the_four_real_choices', async () => {
    const res = mockResponse();

    await controller().form(asUser(), res);

    expect((res.data?.organisationTypeItems as { value: string; text: string }[]).map(item => item.text)).toEqual([
      'HMCTS',
      'Ministry of Justice',
      'Other government department/public body',
      'Other external organisation',
    ]);
  });

  test('the_applications_should_be_read_from_the_backend_as_the_signed_in_user', async () => {
    await controller().form(asUser(), mockResponse());

    expect(listApplications).toHaveBeenCalledWith({ oid: LOCAL_USER.oid, userReference: 'user001' });
  });

  test('applications_that_cannot_be_read_should_leave_none_to_choose_rather_than_fail', async () => {
    (listApplications as jest.Mock).mockRejectedValue(new BackendError('down'));
    const res = mockResponse();

    await controller().form(asUser(), res);

    expect(res.view).toBe('production-credentials/form');
    expect(res.data?.applicationItems).toEqual([]);
  });

  test('an_empty_form_should_report_every_problem_in_order', async () => {
    const res = mockResponse();

    await controller().save(asUser({ body: {} }), res);

    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.data?.errorFor as object)).toEqual([
      'application',
      'organisation-type',
      'organisation',
      'go-live-day',
      'call-volume',
      'data-request',
      'data-recipients',
      'data-combined',
    ]);
  });

  test.each([
    [{ 'go-live-day': '31', 'go-live-month': '2' }, 'Enter a real go-live date'],
    [{ 'go-live-year': '2020' }, 'must be in the future'],
    [{ 'go-live-year': '99' }, 'Enter a real go-live date'],
    [{ 'data-request': 'x'.repeat(2001) }, '2000 characters or fewer'],
    [{ application: 'not-mine' }, 'Select the application'],
    [{ 'data-recipients': [] }, 'Select who will have access to'],
    [{ 'data-recipients': ['made-up'] }, 'Select who will have access to'],
    [{ 'data-recipients': ['other-hmcts'] }, 'Briefly explain who will receive the data and why'],
    [
      { 'data-recipients': ['other-hmcts'], 'data-recipients-explanation': 'x'.repeat(2001) },
      '2000 characters or fewer',
    ],
    [{ 'data-recipients': ['own-team', 'wider-moj'] }, 'Briefly explain who will receive the data and why'],
    [{ 'data-combined': '' }, 'Select whether you will combine or link'],
    [{ 'data-combined': 'maybe' }, 'Select whether you will combine or link'],
    [{ 'data-combined': 'yes' }, 'Briefly describe the other data'],
    [{ 'data-combined': 'unsure' }, 'Briefly describe the other data'],
    [{ 'data-combined': 'yes', 'data-combined-description': 'x'.repeat(2001) }, '2000 characters or fewer'],
    [{ 'organisation-type': '' }, 'Select your organisation'],
    [{ 'organisation-type': 'made-up' }, 'Select your organisation'],
  ])('the_answer_%j_should_be_refused', async (change, message) => {
    const res = mockResponse();

    await controller().save(asUser({ body: answers(applicationId, change) }), res);

    expect(res.statusCode).toBe(400);
    expect(Object.values(res.data?.errorFor as object).join(' ')).toContain(message);
  });

  describe('one request per application', () => {
    const EXISTING = { reference: 'PCR-ABCD2345', status: 'SUBMITTED', submittedAt: '', clientId: 'client-1' };

    test('an_application_that_already_has_a_request_should_not_be_offered', async () => {
      (listProductionRequests as jest.Mock).mockResolvedValue([EXISTING]);
      const res = mockResponse();

      await controller().form(asUser(), res);

      expect(res.data?.applicationItems).toEqual([]);
    });

    test('a_request_for_an_application_that_was_deleted_should_not_hide_anything', async () => {
      (listProductionRequests as jest.Mock).mockResolvedValue([{ ...EXISTING, clientId: null }]);
      const res = mockResponse();

      await controller().form(asUser(), res);

      expect(res.data?.applicationItems).toHaveLength(1);
    });

    test('asking_again_from_a_stale_page_should_be_refused_by_name', async () => {
      (listProductionRequests as jest.Mock).mockResolvedValue([EXISTING]);
      const res = mockResponse();

      await controller().save(asUser({ body: answers(applicationId) }), res);

      expect(res.statusCode).toBe(400);
      expect((res.data?.errorFor as Record<string, string>).application).toBe(
        'Tracker already has a production access request'
      );
    });

    test('requests_that_cannot_be_read_should_leave_the_form_usable_rather_than_block_it', async () => {
      (listProductionRequests as jest.Mock).mockRejectedValue(new Error('down'));
      const res = mockResponse();

      await controller().form(asUser(), res);

      expect(res.data?.applicationItems).toHaveLength(1);
    });

    test('a_duplicate_the_backend_catches_should_say_so_rather_than_invite_a_retry', async () => {
      (submitProductionRequest as jest.Mock).mockRejectedValue(
        new BackendError('Tracker already has a production access request.', 409)
      );
      const res = mockResponse();

      await controller().submit(asUser({ session: { productionDraft: answers(applicationId) } }), res);

      expect(res.statusCode).toBe(409);
      expect(res.data?.error).toBe('Tracker already has a production access request.');
    });

    test('a_backend_that_is_down_should_still_invite_a_retry', async () => {
      (submitProductionRequest as jest.Mock).mockRejectedValue(new BackendError('Could not reach the backend'));
      const res = mockResponse();

      await controller().submit(asUser({ session: { productionDraft: answers(applicationId) } }), res);

      expect(res.statusCode).toBe(502);
      expect(res.data?.error).toContain('Try again in a few minutes');
    });
  });

  test('the_long_answer_should_take_two_thousand_characters', async () => {
    const res = mockResponse();
    const full = { 'data-request': 'x'.repeat(2000) };

    await controller().save(asUser({ body: answers(applicationId, full) }), res);

    expect(res.redirected).toBe('/account/production-credentials/check-answers');
  });

  test('valid_answers_should_be_held_and_shown_for_checking', async () => {
    const req = asUser({ body: answers(applicationId) });

    const saved = mockResponse();
    await controller().save(req, saved);
    expect(saved.redirected).toBe('/account/production-credentials/check-answers');

    const checked = mockResponse();
    await controller().checkAnswers(req, checked);
    expect(checked.view).toBe('production-credentials/check-answers');
    expect(checked.data?.rows).toEqual(
      expect.arrayContaining([
        { key: 'Application', value: 'Tracker' },
        { key: 'APIs', value: 'API one' },
        { key: 'Organisation', value: 'Other external organisation' },
        { key: 'Who will have access to, or receive, the data?', value: 'Me/my immediate team only' },
        { key: 'Will you combine or link the API data with other data?', value: 'No' },
        { key: 'Data request', value: expect.stringContaining('Hearing outcomes') },
      ])
    );
  });

  test('several_recipients_with_an_explanation_should_be_accepted_and_listed_for_checking', async () => {
    const req = asUser({
      body: answers(applicationId, {
        'data-recipients': ['other-hmcts', 'supplier'],
        'data-recipients-explanation': 'Our delivery partner builds the service.',
      }),
    });

    const saved = mockResponse();
    await controller().save(req, saved);
    expect(saved.redirected).toBe('/account/production-credentials/check-answers');

    const checked = mockResponse();
    await controller().checkAnswers(req, checked);
    expect(checked.data?.rows).toEqual(
      expect.arrayContaining([
        {
          key: 'Who will have access to, or receive, the data?',
          value: 'Other HMCTS teams, Supplier/contract/delivery partner',
        },
        { key: 'Who will receive the data and why', value: 'Our delivery partner builds the service.' },
      ])
    );
  });

  test('my_own_team_together_with_other_recipients_should_be_accepted_with_an_explanation', async () => {
    const res = mockResponse();
    const together = {
      'data-recipients': ['own-team', 'wider-moj'],
      'data-recipients-explanation': 'Shared with MOJ.',
    };

    await controller().save(asUser({ body: answers(applicationId, together) }), res);

    expect(res.redirected).toBe('/account/production-credentials/check-answers');
  });

  test('combining_with_other_data_should_be_accepted_with_a_description_and_listed_for_checking', async () => {
    const req = asUser({
      body: answers(applicationId, {
        'data-combined': 'unsure',
        'data-combined-description': 'Case management records, to show a full case history.',
      }),
    });

    const saved = mockResponse();
    await controller().save(req, saved);
    expect(saved.redirected).toBe('/account/production-credentials/check-answers');

    const checked = mockResponse();
    await controller().checkAnswers(req, checked);
    expect(checked.data?.rows).toEqual(
      expect.arrayContaining([
        { key: 'Will you combine or link the API data with other data?', value: 'Unsure' },
        {
          key: 'Other data and what the combined data will be used for',
          value: 'Case management records, to show a full case history.',
        },
      ])
    );
  });

  test('a_description_left_behind_after_choosing_no_should_not_be_shown_for_checking', async () => {
    const req = asUser({ body: answers(applicationId, { 'data-combined-description': 'Left over text.' }) });

    await controller().save(req, mockResponse());
    const checked = mockResponse();
    await controller().checkAnswers(req, checked);

    expect(JSON.stringify(checked.data?.rows)).not.toContain('Left over text.');
  });

  test('a_single_recipient_option_posted_as_text_should_still_count', async () => {
    const res = mockResponse();

    await controller().save(asUser({ body: answers(applicationId, { 'data-recipients': 'own-team' }) }), res);

    expect(res.redirected).toBe('/account/production-credentials/check-answers');
  });

  test('check_answers_and_submit_without_a_draft_should_go_back_to_the_form', async () => {
    for (const action of ['checkAnswers', 'submit'] as const) {
      const res = mockResponse();
      await controller()[action](asUser(), res);
      expect(res.redirected).toBe('/account/production-credentials');
    }
  });

  test('submitting_should_store_the_request_email_the_user_and_quote_a_reference', async () => {
    (submitProductionRequest as jest.Mock).mockResolvedValue(STORED);
    const req = asUser({ session: { productionDraft: answers(applicationId) } });
    const res = mockResponse();

    await controller().submit(req, res);

    expect(res.view).toBe('production-credentials/confirmation');
    expect(res.data?.reference).toBe('PCR-ABCD2345');
    expect(req.session.productionDraft).toBeUndefined();
    expect(await LocalRequests.listLocalRequests(LOCAL_USER.email)).toHaveLength(0);
  });

  test('submitting_should_send_the_answers_the_backend_asks_for', async () => {
    (submitProductionRequest as jest.Mock).mockResolvedValue(STORED);
    const req = asUser({ session: { productionDraft: answers(applicationId) } });

    await controller().submit(req, mockResponse());

    const [owner, submission] = (submitProductionRequest as jest.Mock).mock.calls[0];
    expect(owner.oid).toBe(LOCAL_USER.oid);
    expect(submission).toMatchObject({
      clientId: applicationId,
      organisation: 'Analytical Engines Ltd',
      goLiveDate: `${new Date().getFullYear() + 1}-04-01`,
      callVolume: 'medium',
    });
    expect(submission.dataRequest).toBeDefined();
    expect(submission).not.toHaveProperty('proposedOutputs');
  });

  test('submitting_should_send_the_triage_answers_the_data_access_team_review', async () => {
    (submitProductionRequest as jest.Mock).mockResolvedValue(STORED);
    const draft = answers(applicationId, {
      'organisation-type': 'moj',
      'data-recipients': ['own-team', 'supplier'],
      'data-recipients-explanation': 'Our delivery partner runs the ingest.',
      'data-combined': 'unsure',
      'data-combined-description': 'Possibly our own case tracker.',
    });

    await controller().submit(asUser({ session: { productionDraft: draft } }), mockResponse());

    expect((submitProductionRequest as jest.Mock).mock.calls[0][1]).toMatchObject({
      organisationType: 'moj',
      dataRecipients: ['own-team', 'supplier'],
      dataRecipientsExplanation: 'Our delivery partner runs the ingest.',
      dataCombined: 'unsure',
      dataCombinedDescription: 'Possibly our own case tracker.',
    });
  });

  test('submitting_answers_that_need_no_explanation_should_leave_both_out', async () => {
    (submitProductionRequest as jest.Mock).mockResolvedValue(STORED);
    const req = asUser({ session: { productionDraft: answers(applicationId) } });

    await controller().submit(req, mockResponse());

    const submission = (submitProductionRequest as jest.Mock).mock.calls[0][1];
    expect(submission).toMatchObject({ organisationType: 'external', dataRecipients: ['own-team'] });
    expect(submission).not.toHaveProperty('dataRecipientsExplanation');
    expect(submission).not.toHaveProperty('dataCombinedDescription');
  });

  test('a_failure_to_store_should_keep_the_answers_and_say_so', async () => {
    (submitProductionRequest as jest.Mock).mockRejectedValueOnce(new BackendError('Backend down'));
    const req = asUser({ session: { productionDraft: answers(applicationId) } });
    const res = mockResponse();

    await controller().submit(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.view).toBe('production-credentials/check-answers');
    expect(req.session.productionDraft).toBeDefined();
  });

  test('a_request_should_be_viewable_by_its_owner_only', async () => {
    (getProductionRequest as jest.Mock).mockResolvedValue(STORED);
    const res = mockResponse();
    const next = jest.fn();

    await controller().view(asUser({ params: { reference: 'PCR-ABCD2345' } }), res, next);
    expect(res.view).toBe('production-credentials/view');
    expect(res.data?.status).toBe('Submitted');

    // The backend answers 404 for a reference that is not this user's, and for one that
    // does not exist. Both arrive here as undefined and fall through to not found.
    (getProductionRequest as jest.Mock).mockResolvedValue(undefined);
    await controller().view(asUser({ params: { reference: 'PCR-SOMEONE1' } }), mockResponse(), next);
    await controller().view(asUser({ params: { reference: 'PCR-00000000' } }), mockResponse(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('the_request_page_should_show_the_answers_as_check_answers_did', async () => {
    (getProductionRequest as jest.Mock).mockResolvedValue(STORED);
    const res = mockResponse();

    await controller().view(asUser({ params: { reference: 'PCR-ABCD2345' } }), res, jest.fn());

    const rows = res.data?.rows as { key: string; value: string }[];
    const valueFor = (key: string) => rows.find(row => row.key === key)?.value;
    expect(valueFor('Application')).toBe('Tracker');
    expect(valueFor('Team name (and organisation if external to HMCTS?)')).toBe('Analytical Engines Ltd');
    // Stored values become their labels, as they do on check answers.
    expect(valueFor('Expected call volume')).toBe('Medium');
    expect(valueFor('Go-live date')).toBe('1 April 2027');
    expect(valueFor('Data request')).toBe('Hearing outcomes for listed cases.');
    expect(valueFor('Proposed outputs')).toBe('A weekly outcomes report.');
  });

  test('viewing_a_triaged_request_should_show_every_answer_as_its_label', async () => {
    (getProductionRequest as jest.Mock).mockResolvedValue(TRIAGED);
    const res = mockResponse();

    await controller().view(asUser({ params: { reference: 'PCR-ABCD2345' } }), res, jest.fn());

    const rows = res.data?.rows as { key: string; value: string }[];
    const valueFor = (key: string) => rows.find(row => row.key === key)?.value;
    expect(valueFor('Organisation')).toBe('Other external organisation');
    expect(valueFor('Who will have access to, or receive, the data?')).toBe(
      'Me/my immediate team only, Supplier/contract/delivery partner'
    );
    expect(valueFor('Who will receive the data and why')).toBe('Our delivery partner runs the ingest.');
    expect(valueFor('Will you combine or link the API data with other data?')).toBe('Yes');
    expect(valueFor('Other data and what the combined data will be used for')).toBe(
      'Joined to our own case tracker to measure turnaround.'
    );
  });

  test('viewing_a_request_made_before_the_triage_questions_should_show_no_empty_rows', async () => {
    (getProductionRequest as jest.Mock).mockResolvedValue(STORED);
    const res = mockResponse();

    await controller().view(asUser({ params: { reference: 'PCR-ABCD2345' } }), res, jest.fn());

    const keys = (res.data?.rows as { key: string }[]).map(row => row.key);
    expect(keys).not.toContain('Organisation');
    expect(keys).not.toContain('Who will have access to, or receive, the data?');
    expect(keys).not.toContain('Will you combine or link the API data with other data?');
  });

  test('a_request_made_without_proposed_outputs_should_not_show_an_empty_row', async () => {
    (getProductionRequest as jest.Mock).mockResolvedValue({ ...STORED, proposedOutputs: undefined });
    const res = mockResponse();

    await controller().view(asUser({ params: { reference: 'PCR-ABCD2345' } }), res, jest.fn());

    expect(JSON.stringify(res.data?.rows)).not.toContain('Proposed outputs');
  });
});
