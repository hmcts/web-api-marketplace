import { NextFunction, Request, Response } from 'express';

import { CSRF_FIELD, CSRF_HEADER, csrfFieldHtml, csrfProtection } from '../../../../main/modules/csrf';

type Session = { user?: object; csrfToken?: string };

function call(method: string, session: Session, sent: { body?: string; header?: string } = {}) {
  const req = {
    method,
    path: '/account/applications/new/details',
    session,
    body: sent.body === undefined ? {} : { [CSRF_FIELD]: sent.body },
    get: (name: string) => (name === CSRF_HEADER ? sent.header : undefined),
  } as unknown as Request;
  const res = { locals: {} } as Response;
  const next = jest.fn() as jest.MockedFunction<NextFunction>;
  csrfProtection(req, res, next);
  return { res, next, error: next.mock.calls[0]?.[0] as { status?: number } | undefined };
}

const signedIn = (): Session => ({ user: { id: 1 } });

describe('csrfProtection', () => {
  test('a_signed_in_page_should_get_one_token_for_the_session', () => {
    const session = signedIn();

    const first = call('GET', session).res.locals.csrfToken as string;
    const second = call('GET', session).res.locals.csrfToken as string;

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toBe(first);
    expect(session.csrfToken).toBe(first);
  });

  test('someone_signed_out_should_not_get_a_token', () => {
    const session: Session = {};
    const { res } = call('GET', session);

    expect(res.locals.csrfToken).toBe('');
    expect(session.csrfToken).toBeUndefined();
  });

  test.each(['GET', 'HEAD', 'OPTIONS'])('a_%s_should_pass_without_a_token', method => {
    expect(call(method, signedIn()).error).toBeUndefined();
  });

  test('a_signed_out_post_should_pass_on_to_the_route_which_asks_them_to_sign_in', () => {
    expect(call('POST', {}).error).toBeUndefined();
  });

  test('a_signed_in_post_with_the_token_in_the_form_should_pass', () => {
    const session = { ...signedIn(), csrfToken: 'the-token' };

    expect(call('POST', session, { body: 'the-token' }).error).toBeUndefined();
  });

  test('a_signed_in_post_with_the_token_in_the_header_should_pass', () => {
    const session = { ...signedIn(), csrfToken: 'the-token' };

    expect(call('POST', session, { header: 'the-token' }).error).toBeUndefined();
  });

  test.each([
    ['no_token', {}],
    ['a_wrong_token', { body: 'not-the-token' }],
    ['a_token_of_another_length', { header: 'short' }],
  ])('a_signed_in_post_with_%s_should_be_refused_with_403', (_name, sent) => {
    const session = { ...signedIn(), csrfToken: 'the-token' };

    expect(call('POST', session, sent).error?.status).toBe(403);
  });

  test('a_signed_in_post_before_any_token_was_issued_should_be_refused', () => {
    expect(call('POST', signedIn(), { body: '' }).error?.status).toBe(403);
  });
});

describe('csrfFieldHtml', () => {
  test('should_render_a_hidden_field_with_the_token', () => {
    expect(csrfFieldHtml('abc_-123')).toBe('<input type="hidden" name="_csrf" value="abc_-123">');
  });

  test('should_escape_anything_that_could_break_out_of_the_attribute', () => {
    expect(csrfFieldHtml('"><script>&')).toBe(
      '<input type="hidden" name="_csrf" value="&quot;&gt;&lt;script&gt;&amp;">'
    );
  });
});
