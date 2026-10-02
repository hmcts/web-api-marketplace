import ProductionCredentialsController from '../../../main/controllers/ProductionCredentialsController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { createApplication } from '../../../main/services/Applications';
import * as LocalRequests from '../../../main/services/LocalRequests';
import { CATALOGUE, LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

const controller = () => new ProductionCredentialsController();

function answers(applicationId: string, change: Record<string, unknown> = {}) {
  return {
    application: applicationId,
    organisation: 'Analytical Engines Ltd',
    'go-live-day': '1',
    'go-live-month': '4',
    'go-live-year': String(new Date().getFullYear() + 1),
    'call-volume': 'medium',
    dpia: 'yes',
    dsa: 'in-place',
    'security-contact': 'security@example.com',
    'use-case': 'Case workers look up hearing outcomes.',
    declaration: 'confirmed',
    ...change,
  };
}

describe('ProductionCredentialsController', () => {
  let applicationId: string;

  beforeEach(async () => {
    useDataStore(new MemoryStore());
    applicationId = (
      await createApplication(
        LOCAL_USER.email,
        { environment: 'sandbox', name: 'Tracker', description: '', apis: ['api-one'] },
        CATALOGUE
      )
    ).application.id;
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

  test('the_form_should_prefill_from_the_account_and_the_chosen_application', async () => {
    const res = mockResponse();

    await controller().form(asUser({ query: { application: applicationId } }), res);

    expect(res.view).toBe('production-credentials/form');
    expect(res.data?.answers).toMatchObject({
      application: applicationId,
      organisation: LOCAL_USER.orgName,
      'security-contact': LOCAL_USER.email,
    });
    expect((res.data?.applicationItems as { hint: { text: string } }[])[0].hint.text).toBe('Sandbox – 1 API');
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
      'dpia',
      'dsa',
      'security-contact',
      'use-case',
      'declaration',
    ]);
  });

  test.each([
    [{ 'go-live-day': '31', 'go-live-month': '2' }, 'Enter a real go-live date'],
    [{ 'go-live-year': '2020' }, 'must be in the future'],
    [{ 'go-live-year': '99' }, 'Enter a real go-live date'],
    [{ 'use-case': 'x'.repeat(1001) }, '1000 characters or fewer'],
    [{ application: 'not-mine' }, 'Select the application'],
  ])('the_answer_%j_should_be_refused', async (change, message) => {
    const res = mockResponse();

    await controller().save(asUser({ body: answers(applicationId, change) }), res);

    expect(res.statusCode).toBe(400);
    expect(Object.values(res.data?.errorFor as object).join(' ')).toContain(message);
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
        { key: 'Application', value: 'Tracker (Sandbox)' },
        { key: 'APIs', value: 'API one' },
        { key: 'Data Sharing Agreement', value: 'Yes, it is in place' },
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
    const req = asUser({ session: { productionDraft: answers(applicationId) } });
    const res = mockResponse();

    await controller().submit(req, res);

    expect(res.view).toBe('production-credentials/confirmation');
    expect(res.data?.reference).toMatch(/^PCR-[0-9A-F]{8}$/);
    expect(req.session.productionDraft).toBeUndefined();
    expect(await LocalRequests.listLocalRequests(LOCAL_USER.email)).toHaveLength(1);
  });

  test('a_failure_to_store_should_keep_the_answers_and_say_so', async () => {
    const store = jest.spyOn(LocalRequests, 'addLocalRequest').mockRejectedValueOnce(new Error('Redis down'));
    const req = asUser({ session: { productionDraft: answers(applicationId) } });
    const res = mockResponse();

    try {
      await controller().submit(req, res);
    } finally {
      store.mockRestore();
    }

    expect(res.statusCode).toBe(502);
    expect(res.view).toBe('production-credentials/check-answers');
    expect(req.session.productionDraft).toBeDefined();
  });

  test('a_request_should_be_viewable_by_its_owner_only', async () => {
    const request = await LocalRequests.addLocalRequest(LOCAL_USER.email, 'PRODUCTION', []);
    const other = await LocalRequests.addLocalRequest(LOCAL_USER.email, 'NEW_API', []);
    const res = mockResponse();
    const next = jest.fn();

    await controller().view(asUser({ params: { reference: request.reference } }), res, next);
    expect(res.view).toBe('production-credentials/view');
    expect(res.data?.status).toBe('Submitted');

    await controller().view(asUser({ params: { reference: other.reference } }), mockResponse(), next);
    await controller().view(asUser({ params: { reference: 'PCR-00000000' } }), mockResponse(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
