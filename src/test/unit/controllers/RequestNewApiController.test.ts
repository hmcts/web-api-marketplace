import RequestNewApiController from '../../../main/controllers/RequestNewApiController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { listLocalRequests } from '../../../main/services/LocalRequests';
import { LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

const VALID = { need: 'Prison release dates', domain: 'case-administration', urgency: 'high', existing: '' };

describe('RequestNewApiController', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('a_signed_out_visitor_should_be_sent_to_sign_in', async () => {
    const controller = new RequestNewApiController();
    for (const call of [
      (res: ReturnType<typeof mockResponse>) => controller.form(anonymous(), res),
      (res: ReturnType<typeof mockResponse>) => controller.save(anonymous(), res),
      (res: ReturnType<typeof mockResponse>) => controller.checkAnswers(anonymous(), res),
      (res: ReturnType<typeof mockResponse>) => controller.submit(anonymous(), res),
    ]) {
      const res = mockResponse();
      await call(res);
      expect(res.redirected).toBe('/sign-in');
    }
  });

  test('the_form_should_render_with_the_draft', () => {
    const res = mockResponse();

    new RequestNewApiController().form(asUser({ session: { newApiDraft: VALID } }), res);

    expect(res.view).toBe('request-new-api/form');
    expect(res.data?.answers).toEqual(VALID);
  });

  test('an_empty_form_should_report_every_problem', () => {
    const res = mockResponse();

    new RequestNewApiController().save(asUser({ body: {} }), res);

    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.data?.errorFor as object)).toEqual(['need', 'domain', 'urgency']);
  });

  test('over_long_answers_should_be_refused', () => {
    const res = mockResponse();

    new RequestNewApiController().save(
      asUser({ body: { ...VALID, need: 'x'.repeat(1001), existing: 'y'.repeat(1001) } }),
      res
    );

    expect(Object.keys(res.data?.errorFor as object)).toEqual(['need', 'existing']);
  });

  test('a_valid_request_should_be_checked_then_stored', async () => {
    const req = asUser({ body: VALID });
    const controller = new RequestNewApiController();

    const saved = mockResponse();
    controller.save(req, saved);
    expect(saved.redirected).toBe('/api-catalogue/request-new-api/check-answers');

    const checked = mockResponse();
    controller.checkAnswers(req, checked);
    expect(checked.data?.rows).toEqual(
      expect.arrayContaining([
        { key: 'Name', value: 'Ada Lovelace' },
        { key: 'Justice domain', value: 'Case administration' },
        { key: 'Existing system', value: 'Not provided' },
      ])
    );

    const submitted = mockResponse();
    await controller.submit(req, submitted);
    expect(submitted.data?.reference).toMatch(/^NEW-/);
    expect(await listLocalRequests(LOCAL_USER.email)).toHaveLength(1);
  });

  test('check_answers_and_submit_without_a_draft_should_go_back_to_the_form', async () => {
    const controller = new RequestNewApiController();
    const checked = mockResponse();
    const submitted = mockResponse();

    controller.checkAnswers(asUser(), checked);
    await controller.submit(asUser(), submitted);

    expect(checked.redirected).toBe('/api-catalogue/request-new-api');
    expect(submitted.redirected).toBe('/api-catalogue/request-new-api');
  });
});
