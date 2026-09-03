import { AppRequest } from '../../../main/interfaces/AppRequest';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

const SIGNED_IN_USER = { id: 7, email: 'joe@example.com', firstName: 'Joe', lastName: 'Bloggs', orgName: 'HMCTS DTS' };

/** A request carrying a signed-in session, which both form journeys require. */
export const signedIn = (body: Record<string, unknown> = {}): AppRequest => {
  const req = mockRequest({}, { user: SIGNED_IN_USER as never });
  req.body = body;
  return req;
};

/** A request with no session, to prove the guard turns it away. */
export const signedOut = (body: Record<string, unknown> = {}): AppRequest => {
  const req = mockRequest({});
  req.body = body;
  return req;
};

interface GuardedController {
  get(req: AppRequest, res: never): void;
  post(req: AppRequest, res: never): void | Promise<void>;
  submit(req: AppRequest, res: never): Promise<void>;
}

/**
 * The guard every form journey shares: a signed-out visitor is turned away from the form,
 * from submitting it, and from submitting checked answers.
 *
 * Written once because both journeys assert exactly this, and two copies of it tripped
 * Sonar's duplication threshold. A third journey inherits the same guarantees by calling
 * this rather than by copying a block.
 */
export function describeSignInGuard(create: () => GuardedController, completeBody: Record<string, unknown>): void {
  test('a_signed_out_visitor_should_be_redirected_away_from_the_form', () => {
    const res = mockResponse();

    create().get(signedOut(), res as never);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });

  test('a_signed_out_visitor_should_not_be_able_to_submit_the_form', async () => {
    // The point of the guard: hiding the navigation link does not stop a POST.
    const res = mockResponse();

    await create().post(signedOut(completeBody), res as never);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });

  test('a_signed_out_visitor_should_not_be_able_to_submit_checked_answers', async () => {
    const res = mockResponse();

    await create().submit(signedOut(completeBody), res as never);

    expect(res.redirected).toBe('/sign-in');
    expect(res.view).toBeUndefined();
  });
}
