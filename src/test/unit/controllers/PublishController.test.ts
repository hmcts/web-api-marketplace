import { Request, Response } from 'express';

import PublishController from '../../../main/controllers/PublishController';
import { PUBLISH_DECLARATIONS } from '../../../main/services/PublicationRequest';

const completeBody = {
  'api-name': 'Court Schedule',
  'owning-team': 'Scheduling and Listing',
  'contact-email': 'sandl-api@justice.gov.uk',
  'spec-url': 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
  classification: 'official',
  declarations: PUBLISH_DECLARATIONS.map(declaration => declaration.value),
};

function mockResponse(): Response & {
  statusCode?: number;
  view?: string;
  data?: Record<string, never>;
  redirected?: string;
} {
  const res: Record<string, unknown> = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.render = jest.fn().mockImplementation((view: string, data: Record<string, unknown>) => {
    res.view = view;
    res.data = data;
  });
  res.redirect = jest.fn().mockImplementation((to: string) => {
    res.redirected = to;
  });
  return res as never;
}

const mockRequest = (body: Record<string, unknown> = {}) => ({ body }) as Request;

describe('PublishController', () => {
  test('getting_the_page_should_render_the_form', () => {
    const res = mockResponse();

    new PublishController().get(mockRequest(), res);

    expect(res.view).toBe('publish/form');
  });

  test('posting_an_empty_form_should_return_400_and_re_render_with_errors', () => {
    const res = mockResponse();

    new PublishController().post(mockRequest(), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('publish/form');
    expect(res.data?.errors as unknown as unknown[]).toHaveLength(6);
  });

  test('posting_an_invalid_form_should_return_the_answers_so_nothing_is_retyped', () => {
    const res = mockResponse();

    new PublishController().post(mockRequest({ ...completeBody, 'contact-email': '' }), res);

    expect((res.data?.answers as unknown as Record<string, string>)['api-name']).toBe('Court Schedule');
  });

  test('posting_a_valid_form_should_show_the_check_answers_page', () => {
    const res = mockResponse();

    new PublishController().post(mockRequest(completeBody), res);

    expect(res.view).toBe('publish/check-answers');
    expect(res.statusCode).toBeUndefined();
  });

  test('submitting_valid_answers_should_show_the_confirmation_with_a_reference', async () => {
    const res = mockResponse();

    await new PublishController().submit(mockRequest(completeBody), res);

    expect(res.view).toBe('publish/confirmation');
    expect(res.data?.reference).toMatch(/^AMP-/);
  });

  test('submitting_tampered_answers_should_return_400_rather_than_a_confirmation', async () => {
    const res = mockResponse();

    await new PublishController().submit(mockRequest({ ...completeBody, classification: 'secret' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('publish/form');
  });

  test('opening_check_answers_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new PublishController().checkAnswers(mockRequest(), res);

    expect(res.redirected).toBe('/publish');
  });

  test('opening_the_confirmation_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new PublishController().confirmation(mockRequest(), res);

    expect(res.redirected).toBe('/publish');
  });
});
