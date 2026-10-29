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

const APPLICATION = {
  id: 'client-1',
  clientId: 'client-1',
  tenantId: 'tenant-1',
  name: 'Tracker',
  secretHint: 'Uc6',
  secretExpiresAt: '',
  createdAt: '',
  apis: [
    { apiName: 'api-one', apiTitle: 'API one', publisherId: 'one', subscriptionName: 'amp-temp-1', subscribedAt: '' },
  ],
  accessGranted: true,
};

const controller = () => new ProductionCredentialsController();

function answers(applicationId: string, change: Record<string, unknown> = {}) {
  return {
    application: applicationId,
    organisation: 'Analytical Engines Ltd',
    'go-live-day': '1',
    'go-live-month': '4',
    'go-live-year': String(new Date().getFullYear() + 1),
    'call-volume': 'medium',
    'data-request': 'Hearing outcomes, used with court listings to show case workers what happened.',
    'proposed-outputs': 'A case summary shown to case workers inside our own service.',
    ...change,
  };
}

describe('ProductionCredentialsController', () => {
  let applicationId: string;

  beforeEach(() => {
    useDataStore(new MemoryStore());
    (listApplications as jest.Mock).mockReset().mockResolvedValue([APPLICATION]);
    (listProductionRequests as jest.Mock).mockReset().mockResolvedValue([]);
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
      'organisation',
      'go-live-day',
      'call-volume',
      'data-request',
      'proposed-outputs',
    ]);
  });

  test.each([
    [{ 'go-live-day': '31', 'go-live-month': '2' }, 'Enter a real go-live date'],
    [{ 'go-live-year': '2020' }, 'must be in the future'],
    [{ 'go-live-year': '99' }, 'Enter a real go-live date'],
    [{ 'data-request': 'x'.repeat(2001) }, '2000 characters or fewer'],
    [{ 'proposed-outputs': 'x'.repeat(2001) }, '2000 characters or fewer'],
    [{ application: 'not-mine' }, 'Select the application'],
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

  test('the_long_answers_should_take_two_thousand_characters', async () => {
    const res = mockResponse();
    const full = { 'data-request': 'x'.repeat(2000), 'proposed-outputs': 'y'.repeat(2000) };

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
        { key: 'Data request', value: expect.stringContaining('Hearing outcomes') },
        { key: 'Proposed outputs', value: expect.stringContaining('case summary') },
      ])
    );
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
    expect(submission.proposedOutputs).toBeDefined();
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
    expect(valueFor('Organisation or team name')).toBe('Analytical Engines Ltd');
    // Stored values become their labels, as they do on check answers.
    expect(valueFor('Expected call volume')).toBe('Medium');
    expect(valueFor('Go-live date')).toBe('1 April 2027');
    expect(valueFor('Data request')).toBe('Hearing outcomes for listed cases.');
    expect(valueFor('Proposed outputs')).toBe('A weekly outcomes report.');
  });
});
