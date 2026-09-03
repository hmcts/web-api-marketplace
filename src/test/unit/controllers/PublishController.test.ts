jest.mock('../../../main/services/PublicationRequest', () => ({
  ...jest.requireActual('../../../main/services/PublicationRequest'),
  submitPublicationRequest: jest.fn(),
}));

import PublishController from '../../../main/controllers/PublishController';
import { describeSignInGuard, signedIn } from '../helpers/signInGuard';
import { mockResponse } from '../mocks/mockResponse';

const completeBody = {
  'api-name': 'Court Schedule',
  'owning-team': 'Scheduling and Listing',
  'contact-email': 'sandl-api@justice.gov.uk',
  'spec-url': 'https://raw.githubusercontent.com/hmcts/api-cp-crime-slc/main/openapi-spec.yml',
};

const { submitPublicationRequest } = require('../../../main/services/PublicationRequest');

describe('PublishController', () => {
  beforeEach(() => {
    (submitPublicationRequest as jest.Mock).mockReset();
    (submitPublicationRequest as jest.Mock).mockResolvedValue({ ok: true, reference: 'e6a1c0de-0000' });
  });

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
    expect(res.data?.errors as unknown as unknown[]).toHaveLength(4);
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
    expect(res.data?.reference).toBe('e6a1c0de-0000');
  });

  test('submitting_tampered_answers_should_return_400_rather_than_a_confirmation', async () => {
    const res = mockResponse();

    await new PublishController().submit(signedIn({ ...completeBody, 'spec-url': 'not-a-url' }), res);

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

  describeSignInGuard(() => new PublishController(), completeBody);

  test('a_backend_failure_should_keep_the_answers_and_say_so_rather_than_confirm', async () => {
    (submitPublicationRequest as jest.Mock).mockResolvedValue({ ok: false });
    const res = mockResponse();

    await new PublishController().submit(signedIn(completeBody), res);

    expect(res.view).toBe('publish/check-answers');
    expect(res.statusCode).toBe(502);
    expect(res.data?.error).toContain('could not be sent');
    expect(res.data?.answers).toBeDefined();
  });

  test('submitting_should_pass_the_signed_in_user_to_the_backend', async () => {
    const res = mockResponse();

    await new PublishController().submit(signedIn(completeBody), res);

    const [, requester] = (submitPublicationRequest as jest.Mock).mock.calls[0];
    expect(requester.id).toBe(7);
    expect(requester.email).toBe('joe@example.com');
  });
});
