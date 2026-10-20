import SignOutController from '../../../main/controllers/SignOutController';
import { StubEntra, startStubEntra } from '../../stubs/entra';
import { LOCAL_USER } from '../helpers/consumer';
import { mockRequest } from '../mocks/mockRequest';
import { mockResponse } from '../mocks/mockResponse';

let entra: StubEntra;

beforeAll(async () => {
  entra = await startStubEntra();
});

afterAll(() => entra.close());

describe('SignOutController', () => {
  test('signing_out_should_end_our_session_and_then_entras', async () => {
    const res = mockResponse();
    const req = mockRequest({}, { user: LOCAL_USER as never });

    await new SignOutController().post(req, res);

    expect(req.session.user).toBeUndefined();
    expect(res.cleared).toBe('connect.sid');
    const sentTo = new URL(res.redirected as string);
    expect(sentTo.origin + sentTo.pathname).toBe(entra.endSessionEndpoint);
    expect(sentTo.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost/');
  });

  test('an_unreachable_tenant_should_still_sign_out_here_and_go_home', async () => {
    process.env.ENTRA_DISCOVERY_ENDPOINT = 'http://127.0.0.1:1/nowhere';
    try {
      const res = mockResponse();
      const req = mockRequest({}, { user: LOCAL_USER as never });

      await new SignOutController().post(req, res);

      expect(req.session.user).toBeUndefined();
      expect(res.redirected).toBe('/');
    } finally {
      delete process.env.ENTRA_DISCOVERY_ENDPOINT;
    }
  });

  describe('with the Entra bypass on', () => {
    const environment = { ...process.env };

    afterEach(() => {
      process.env = { ...environment };
    });

    test('signing_out_should_go_home_rather_than_to_entra', async () => {
      process.env.BYPASS_ENTRA = 'true';
      process.env.NODE_ENV = 'development';
      const res = mockResponse();
      const req = mockRequest({}, { user: LOCAL_USER as never });

      await new SignOutController().post(req, res);

      expect(req.session.user).toBeUndefined();
      expect(res.cleared).toBe('connect.sid');
      expect(res.redirected).toBe('/');
    });
  });
});
