import PublishController from '../../../main/controllers/PublishController';
import { PUBLISH_DECLARATIONS } from '../../../main/services/PublicationRequest';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

const completeBody = {
  'api-name': 'Court Schedule',
  'owning-team': 'Scheduling and Listing',
  'contact-email': 'sandl-api@justice.gov.uk',
  'spec-url': 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
  classification: 'official',
  declarations: PUBLISH_DECLARATIONS.map(declaration => declaration.value),
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

describe('PublishController', () => {
  test('getting_the_page_should_render_the_form', () => {
    const res = mockResponse();

    new PublishController().get(signedIn(), res);

    expect(res.view).toBe('publish/form');
  });

  test('posting_an_empty_form_should_return_400_and_re_render_with_errors', () => {
    const res = mockResponse();

    new PublishController().post(signedIn(), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('publish/form');
    expect(res.data?.errors as unknown as unknown[]).toHaveLength(6);
  });

  test('posting_an_invalid_form_should_return_the_answers_so_nothing_is_retyped', () => {
    const res = mockResponse();

    new PublishController().post(signedIn({ ...completeBody, 'contact-email': '' }), res);

    expect((res.data?.answers as unknown as Record<string, string>)['api-name']).toBe('Court Schedule');
  });

  test('posting_a_valid_form_should_show_the_check_answers_page', () => {
    const res = mockResponse();

    new PublishController().post(signedIn(completeBody), res);

    expect(res.view).toBe('publish/check-answers');
    expect(res.statusCode).toBeUndefined();
  });

  test('submitting_valid_answers_should_show_the_confirmation_with_a_reference', async () => {
    const res = mockResponse();

    await new PublishController().submit(signedIn(completeBody), res);

    expect(res.view).toBe('publish/confirmation');
    expect(res.data?.reference).toMatch(/^AMP-/);
  });

  test('submitting_tampered_answers_should_return_400_rather_than_a_confirmation', async () => {
    const res = mockResponse();

    await new PublishController().submit(signedIn({ ...completeBody, classification: 'secret' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.view).toBe('publish/form');
  });

  test('opening_check_answers_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new PublishController().checkAnswers(signedIn(), res);

    expect(res.redirected).toBe('/publish');
  });

  test('opening_the_confirmation_directly_should_redirect_to_the_form', () => {
    const res = mockResponse();

    new PublishController().confirmation(signedIn(), res);

    expect(res.redirected).toBe('/publish');
  });

  test('a_signed_out_visitor_should_be_redirected_away_from_the_form', () => {
    const res = mockResponse();

    new PublishController().get(signedOut(), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });

  test('a_signed_out_visitor_should_not_be_able_to_submit_the_form', async () => {
    // The point of the guard: hiding the navigation link does not stop a POST.
    const res = mockResponse();

    await new PublishController().post(signedOut(completeBody), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });

  test('a_signed_out_visitor_should_not_be_able_to_submit_checked_answers', async () => {
    const res = mockResponse();

    await new PublishController().submit(signedOut(completeBody), res);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });
});
