import SubscribeController from '../../../main/controllers/SubscribeController';
import { DECLARATIONS } from '../../../main/services/AccessRequest';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/ApiCatalogue', () => ({ getCatalogueApis: jest.fn() }));

const { getCatalogueApis } = require('../../../main/services/ApiCatalogue');

const catalogue = [{ name: 'api-cp-ai-rag', title: 'RAG Service API' }];

const completeBody = {
  'full-name': 'Joe Bloggs',
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

const SIGNED_IN = { email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

/** Both journeys require an account, so the default request in these tests carries one. */
const signedIn = (body: Record<string, unknown> = {}) => {
  const req = mockRequest({}, { user: SIGNED_IN as never });
  req.body = body;
  return req;
};

const signedOut = (body: Record<string, unknown> = {}) => {
  const req = mockRequest({});
  req.body = body;
  return req;
};

describe('SubscribeController', () => {
  beforeEach(() => {
    (getCatalogueApis as jest.Mock).mockReset();
    (getCatalogueApis as jest.Mock).mockResolvedValue(catalogue);
  });

  test('getting_the_page_should_render_the_form', async () => {
    const res = mockResponse();

    await new SubscribeController().get(signedIn(), res);

    expect(res.view).toBe('subscribe/index');
  });

  test('the_api_list_should_be_offered_with_a_choose_an_api_placeholder_first', async () => {
    const res = mockResponse();

    await new SubscribeController().get(signedIn(), res);

    expect(res.data?.apiOptions).toEqual([
      { value: '', text: 'Choose an API' },
      { value: 'api-cp-ai-rag', text: 'RAG Service API' },
    ]);
  });

  test('posting_an_empty_form_should_return_400_and_re_render_with_errors', async () => {
    const res = mockResponse();

    await new SubscribeController().post(signedIn(), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('subscribe/index');
    expect((res.data?.errors as unknown as unknown[]).length).toBeGreaterThan(0);
  });

  test('posting_an_invalid_form_should_return_the_answers_so_nothing_is_retyped', async () => {
    const res = mockResponse();

    await new SubscribeController().post(signedIn({ ...completeBody, email: '' }), res);

    expect((res.data?.answers as unknown as Record<string, string>)['full-name']).toBe('Joe Bloggs');
  });

  test('posting_a_valid_form_should_show_the_check_answers_page', async () => {
    const res = mockResponse();

    await new SubscribeController().post(signedIn(completeBody), res);

    expect(res.view).toBe('subscribe/check-answers');
    expect(res.statusCode).toBeUndefined();
  });

  test('submitting_valid_answers_should_show_the_confirmation_with_a_reference', async () => {
    const res = mockResponse();

    await new SubscribeController().submit(signedIn(completeBody), res);

    expect(res.view).toBe('subscribe/confirmation');
    expect(res.data?.reference).toMatch(/^AMP-/);
  });

  test('submitting_tampered_answers_should_return_400_rather_than_a_confirmation', async () => {
    const res = mockResponse();

    await new SubscribeController().submit(signedIn({ ...completeBody, 'api-name': 'made-up' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('subscribe/index');
  });

  test('opening_check_answers_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new SubscribeController().checkAnswers(signedIn(), res);

    expect(res.redirected).toBe('/subscribe');
  });

  test('opening_the_confirmation_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new SubscribeController().confirmation(signedIn(), res);

    expect(res.redirected).toBe('/subscribe');
  });

  test('a_signed_out_visitor_should_be_redirected_away_from_the_form', () => {
    const res = mockResponse();

    new SubscribeController().get(signedOut(), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });

  test('a_signed_out_visitor_should_not_be_able_to_submit_the_form', async () => {
    // The point of the guard: hiding the navigation link does not stop a POST.
    const res = mockResponse();

    await new SubscribeController().post(signedOut(completeBody), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });

  test('a_signed_out_visitor_should_not_be_able_to_submit_checked_answers', async () => {
    const res = mockResponse();

    await new SubscribeController().submit(signedOut(completeBody), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });
});
