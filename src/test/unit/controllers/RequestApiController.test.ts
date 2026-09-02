import { Request } from 'express';

import RequestApiController from '../../../main/controllers/RequestApiController';
import { DECLARATIONS } from '../../../main/services/AccessRequest';
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

const mockRequest = (body: Record<string, unknown> = {}) => ({ body }) as Request;

describe('RequestApiController', () => {
  beforeEach(() => {
    (getCatalogueApis as jest.Mock).mockReset();
    (getCatalogueApis as jest.Mock).mockResolvedValue(catalogue);
  });

  test('getting_the_page_should_render_the_form', async () => {
    const res = mockResponse();

    await new RequestApiController().get(mockRequest(), res);

    expect(res.view).toBe('get-started/request-api/index');
  });

  test('the_api_list_should_be_offered_with_a_choose_an_api_placeholder_first', async () => {
    const res = mockResponse();

    await new RequestApiController().get(mockRequest(), res);

    expect(res.data?.apiOptions).toEqual([
      { value: '', text: 'Choose an API' },
      { value: 'api-cp-ai-rag', text: 'RAG Service API' },
    ]);
  });

  test('posting_an_empty_form_should_return_400_and_re_render_with_errors', async () => {
    const res = mockResponse();

    await new RequestApiController().post(mockRequest(), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('get-started/request-api/index');
    expect((res.data?.errors as unknown as unknown[]).length).toBeGreaterThan(0);
  });

  test('posting_an_invalid_form_should_return_the_answers_so_nothing_is_retyped', async () => {
    const res = mockResponse();

    await new RequestApiController().post(mockRequest({ ...completeBody, email: '' }), res);

    expect((res.data?.answers as unknown as Record<string, string>)['full-name']).toBe('Joe Bloggs');
  });

  test('posting_a_valid_form_should_show_the_check_answers_page', async () => {
    const res = mockResponse();

    await new RequestApiController().post(mockRequest(completeBody), res);

    expect(res.view).toBe('get-started/request-api/check-answers');
    expect(res.statusCode).toBeUndefined();
  });

  test('submitting_valid_answers_should_show_the_confirmation_with_a_reference', async () => {
    const res = mockResponse();

    await new RequestApiController().submit(mockRequest(completeBody), res);

    expect(res.view).toBe('get-started/request-api/confirmation');
    expect(res.data?.reference).toMatch(/^AMP-/);
  });

  test('submitting_tampered_answers_should_return_400_rather_than_a_confirmation', async () => {
    const res = mockResponse();

    await new RequestApiController().submit(mockRequest({ ...completeBody, 'api-name': 'made-up' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('get-started/request-api/index');
  });

  test('opening_check_answers_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new RequestApiController().checkAnswers(mockRequest(), res);

    expect(res.redirected).toBe('/get-started/request-api');
  });

  test('opening_the_confirmation_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new RequestApiController().confirmation(mockRequest(), res);

    expect(res.redirected).toBe('/get-started/request-api');
  });
});
