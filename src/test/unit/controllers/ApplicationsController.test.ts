import ApplicationsController from '../../../main/controllers/ApplicationsController';
import { Application, BackendError } from '../../../main/services/Applications';
import { CATALOGUE, LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
  listedApiNames: jest.fn(),
}));

jest.mock('../../../main/services/Applications', () => ({
  ...jest.requireActual('../../../main/services/Applications'),
  listApplications: jest.fn(),
  getApplication: jest.fn(),
  createApplication: jest.fn(),
  grantAccess: jest.fn(),
  setApis: jest.fn(),
  subscriptionKey: jest.fn(),
  deleteApplication: jest.fn(),
}));

const { listedApiNames, getCatalogueApis } = require('../../../main/services/ApiCatalogue');
const Applications = require('../../../main/services/Applications');

const OWNER = { oid: LOCAL_USER.oid, userReference: 'user001' };
const DRAFT = { name: 'Case Viewer', apis: ['api-one'] };
const APPLICATION: Application = {
  id: 'client-1',
  clientId: 'client-1',
  tenantId: 'tenant-1',
  name: 'Case Viewer',
  secretHint: 'Uc6',
  secretExpiresAt: '2028-10-15T12:00:00',
  createdAt: '2026-10-15T12:00:00',
  apis: [
    {
      apiName: 'api-one',
      apiTitle: 'API one',
      publisherId: 'one',
      subscriptionName: 'amp-temp-1',
      subscribedAt: '2026-10-15T12:00:00',
    },
  ],
  accessGranted: false,
};

const controller = () => new ApplicationsController();
const withAccept = (req: ReturnType<typeof asUser>, type: 'json' | 'html') =>
  Object.assign(req, { accepts: jest.fn(() => type) });

describe('ApplicationsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCatalogueApis as jest.Mock).mockResolvedValue(CATALOGUE);
    (listedApiNames as jest.Mock).mockReturnValue([]);
    Applications.getApplication.mockResolvedValue(APPLICATION);
  });

  describe('signed out', () => {
    test('every_page_should_send_the_visitor_to_sign_in', async () => {
      const next = jest.fn();
      const calls: ((res: ReturnType<typeof mockResponse>) => unknown)[] = [
        res => controller().list(anonymous(), res),
        res => controller().intro(anonymous(), res),
        res => controller().details(anonymous(), res),
        res => controller().saveDetails(anonymous(), res),
        res => controller().chooseApis(anonymous(), res),
        res => controller().saveApis(anonymous(), res),
        res => controller().checkAnswers(anonymous(), res),
        res => controller().create(anonymous(), res),
        res => controller().detail(anonymous({ params: { id: 'x' } }), res, next),
        res => controller().access(anonymous({ params: { id: 'x' } }), res, next),
      ];

      for (const call of calls) {
        const res = mockResponse();
        await call(res);
        expect(res.redirected).toBe('/sign-in');
      }
      expect(next).not.toHaveBeenCalled();
      expect(Applications.listApplications).not.toHaveBeenCalled();
    });
  });

  describe('listing', () => {
    test('the_callers_applications_should_be_listed_with_a_one_off_notice', async () => {
      Applications.listApplications.mockResolvedValue([APPLICATION]);
      const res = mockResponse();
      const notice = { success: true, title: 'Success', text: 'Done' };
      const req = asUser({ session: { notice } });

      await controller().list(req, res);

      expect(Applications.listApplications).toHaveBeenCalledWith(OWNER);
      expect(res.view).toBe('applications/index');
      expect(res.data).toEqual({ notice, applications: [APPLICATION] });
      expect(req.session.notice).toBeUndefined();
    });

    test('a_backend_that_cannot_be_reached_should_say_so', async () => {
      Applications.listApplications.mockRejectedValue(new BackendError('down'));
      const res = mockResponse();

      await controller().list(asUser(), res);

      expect(res.statusCode).toBe(503);
      expect(res.view).toBe('applications/unavailable');
    });

    test('a_user_the_backend_does_not_know_should_be_signed_out_and_sent_to_sign_in', async () => {
      Applications.listApplications.mockRejectedValue(new BackendError('Sign in again.', 404));
      const res = mockResponse();
      const req = asUser();

      await controller().list(req, res);

      expect(res.redirected).toBe('/sign-in');
      expect(req.session.user).toBeUndefined();
    });
  });

  describe('creating', () => {
    test('the_intro_should_clear_any_earlier_answers', () => {
      const req = asUser({ session: { applicationDraft: DRAFT } });

      controller().intro(req, mockResponse());

      expect(req.session.applicationDraft).toBeUndefined();
    });

    test('a_name_that_breaks_the_rules_should_be_shown_again_with_the_error', () => {
      const res = mockResponse();

      controller().saveDetails(asUser({ body: { name: 'Reports' } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.view).toBe('applications/new/details');
      expect(res.data?.errorFor).toEqual({ name: 'Application name must be 8 to 50 letters, numbers or spaces' });
    });

    test('a_valid_name_should_go_on_to_choosing_apis', () => {
      const res = mockResponse();
      const req = asUser({ body: { name: 'Case Viewer' } });

      controller().saveDetails(req, res);

      expect(req.session.applicationDraft).toEqual({ name: 'Case Viewer' });
      expect(res.redirected).toBe('/account/applications/new/apis');
    });

    test('changing_the_name_once_apis_are_chosen_should_return_to_check_answers', () => {
      const res = mockResponse();

      controller().saveDetails(asUser({ body: { name: 'Case Viewer 2' }, session: { applicationDraft: DRAFT } }), res);

      expect(res.redirected).toBe('/account/applications/new/check-answers');
    });

    test('choosing_apis_without_a_name_should_go_back_to_details', async () => {
      for (const action of ['chooseApis', 'saveApis'] as const) {
        const res = mockResponse();
        await controller()[action](asUser(), res);
        expect(res.redirected).toBe('/account/applications/new/details');
      }
    });

    test('the_api_list_should_come_from_the_catalogue_with_choices_ticked', async () => {
      const res = mockResponse();

      await controller().chooseApis(asUser({ session: { applicationDraft: DRAFT } }), res);

      expect(res.data?.apiItems).toEqual([
        { value: 'api-one', text: 'API one', hint: { text: 'The first API.' }, checked: true },
        { value: 'api-two', text: 'API two', hint: undefined, checked: false },
      ]);
    });

    test('no_apis_chosen_should_be_refused_and_chosen_apis_should_go_on', async () => {
      const refused = mockResponse();
      await controller().saveApis(asUser({ session: { applicationDraft: { name: 'Case Viewer' } } }), refused);
      expect(refused.statusCode).toBe(400);

      const res = mockResponse();
      const req = asUser({ body: { apis: ['api-two'] }, session: { applicationDraft: { name: 'Case Viewer' } } });
      await controller().saveApis(req, res);
      expect(req.session.applicationDraft?.apis).toEqual(['api-two']);
      expect(res.redirected).toBe('/account/applications/new/check-answers');
    });

    test('only_the_allowed_apis_should_be_offered', async () => {
      (listedApiNames as jest.Mock).mockReturnValue(['api-two']);
      const res = mockResponse();

      await controller().chooseApis(asUser({ session: { applicationDraft: { name: 'Case Viewer' } } }), res);

      expect((res.data?.apiItems as { value: string }[]).map(item => item.value)).toEqual(['api-two']);
    });

    test('an_api_that_is_not_offered_should_be_refused_when_chosen_and_when_created', async () => {
      (listedApiNames as jest.Mock).mockReturnValue(['api-two']);

      const refused = mockResponse();
      const req = asUser({ body: { apis: ['api-one'] }, session: { applicationDraft: { name: 'Case Viewer' } } });
      await controller().saveApis(req, refused);
      expect(refused.statusCode).toBe(400);

      const res = mockResponse();
      await controller().create(asUser({ session: { applicationDraft: DRAFT } }), res);
      expect(Applications.createApplication).not.toHaveBeenCalled();
    });

    test('check_answers_should_list_the_name_and_api_titles', async () => {
      const res = mockResponse();

      await controller().checkAnswers(asUser({ session: { applicationDraft: DRAFT } }), res);

      expect(res.data?.rows).toEqual([
        { key: 'Application name', value: 'Case Viewer', href: '/account/applications/new/details' },
        { key: 'APIs', value: 'API one', href: '/account/applications/new/apis' },
      ]);
    });

    test('check_answers_without_apis_should_go_back_to_choosing_them', async () => {
      const res = mockResponse();

      await controller().checkAnswers(asUser({ session: { applicationDraft: { name: 'Case Viewer' } } }), res);

      expect(res.redirected).toBe('/account/applications/new/apis');
    });

    test('creating_should_show_the_secret_and_keys_once_with_access_still_to_set_up', async () => {
      const created = { application: APPLICATION, clientSecret: 'Uc6Q~secret', keys: [], failedApis: [] };
      Applications.createApplication.mockResolvedValue(created);
      const res = mockResponse();
      const req = asUser({ session: { applicationDraft: DRAFT } });

      await controller().create(req, res);

      expect(Applications.createApplication).toHaveBeenCalledWith(OWNER, DRAFT, CATALOGUE);
      expect(res.view).toBe('applications/new/confirmation');
      expect(res.data).toEqual({ ...created, accessAttempts: 8, accessRetrySeconds: 15 });
      expect(req.session.applicationDraft).toBeUndefined();
    });

    test('creating_with_no_draft_should_go_to_the_list', async () => {
      const res = mockResponse();

      await controller().create(asUser(), res);

      expect(res.redirected).toBe('/account/applications');
      expect(Applications.createApplication).not.toHaveBeenCalled();
    });

    test.each([
      [409, 'Taken', 'You already have an application called Case Viewer'],
      [400, 'Use letters, digits and spaces only.', 'Use letters, digits and spaces only.'],
    ])('a_%i_from_the_backend_should_go_back_to_the_name', async (status, message, shown) => {
      Applications.createApplication.mockRejectedValue(new BackendError(message, status));
      const res = mockResponse();
      const req = asUser({ session: { applicationDraft: DRAFT } });

      await controller().create(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.view).toBe('applications/new/details');
      expect(res.data?.errorFor).toEqual({ name: shown });
      expect(req.session.applicationDraft).toEqual(DRAFT);
    });

    test('an_outage_while_creating_should_say_so_and_keep_the_answers', async () => {
      Applications.createApplication.mockRejectedValue(new BackendError('Entra unreachable', 502));
      const res = mockResponse();
      const req = asUser({ session: { applicationDraft: DRAFT } });

      await controller().create(req, res);

      expect(res.statusCode).toBe(503);
      expect(req.session.applicationDraft).toEqual(DRAFT);
    });
  });

  describe('one application', () => {
    const forId = (parts: Parameters<typeof asUser>[0] = {}) =>
      asUser({ ...parts, params: { id: 'client-1', ...parts.params } });

    test('an_application_that_is_not_the_callers_should_be_handed_on_as_not_found', async () => {
      Applications.getApplication.mockResolvedValue(undefined);
      const next = jest.fn();
      const res = mockResponse();

      await controller().detail(forId(), res, next);

      expect(next).toHaveBeenCalled();
      expect(res.view).toBeUndefined();
    });

    test('the_detail_page_should_show_the_masked_secret_and_the_access_settings', async () => {
      const res = mockResponse();

      await controller().detail(forId(), res, jest.fn());

      expect(Applications.getApplication).toHaveBeenCalledWith(OWNER, 'client-1');
      expect(res.view).toBe('applications/detail');
      expect(res.data).toMatchObject({ maskedSecret: 'Uc6****', accessAttempts: 8, accessRetrySeconds: 15 });
    });

    test('the_detail_page_should_carry_the_token_instructions_for_the_application', async () => {
      const res = mockResponse();

      await controller().detail(forId(), res, jest.fn());

      expect(res.data?.token).toMatchObject({
        url: 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
        clientId: 'client-1',
        clientSecret: '<client_secret>',
        scope: 'one/.default',
      });
      expect(res.data?.slc).toBeUndefined();
    });

    test.each([[{ state: 'granted' }], [{ state: 'pending' }], [{ state: 'failed', message: 'Graph refused.' }]])(
      'an_access_check_from_the_page_should_answer_%j_as_json',
      async result => {
        Applications.grantAccess.mockResolvedValue(result);
        const res = mockResponse();

        await controller().access(withAccept(forId(), 'json'), res, jest.fn());

        expect(Applications.grantAccess).toHaveBeenCalledWith(OWNER, APPLICATION);
        expect(res.body).toEqual(result);
      }
    );

    test('an_access_check_that_cannot_reach_the_backend_should_answer_502_as_json', async () => {
      Applications.grantAccess.mockRejectedValue(new BackendError('down'));
      const res = mockResponse();

      await controller().access(withAccept(forId(), 'json'), res, jest.fn());

      expect(res.statusCode).toBe(502);
      expect(res.body).toMatchObject({ state: 'failed' });
    });

    test.each([
      [{ state: 'granted' }, true, 'Case Viewer can now call the APIs it is subscribed to.'],
      [{ state: 'pending' }, false, 'Access is still being set up. Try again in a minute.'],
      [{ state: 'failed', message: 'Graph refused.' }, false, 'Access could not be set up: Graph refused.'],
    ])('an_access_check_without_javascript_should_come_back_with_%j', async (result, success, text) => {
      Applications.grantAccess.mockResolvedValue(result);
      const res = mockResponse();
      const req = withAccept(forId(), 'html');

      await controller().access(req, res, jest.fn());

      expect(res.redirected).toBe('/account/applications/client-1');
      expect(req.session.notice).toMatchObject({ success, text });
    });

    test('the_apis_form_should_tick_the_current_apis', async () => {
      const res = mockResponse();

      await controller().editApis(forId(), res, jest.fn());

      expect((res.data?.apiItems as { checked: boolean }[]).map(item => item.checked)).toEqual([true, false]);
    });

    test('an_api_no_longer_offered_should_still_show_while_the_application_has_it', async () => {
      (listedApiNames as jest.Mock).mockReturnValue(['api-two']);
      const res = mockResponse();

      await controller().editApis(forId(), res, jest.fn());

      expect(
        (res.data?.apiItems as { value: string; checked: boolean }[]).map(item => [item.value, item.checked])
      ).toEqual([
        ['api-one', true],
        ['api-two', false],
      ]);
    });

    test('keeping_an_api_no_longer_offered_should_be_allowed_but_adding_one_should_not', async () => {
      (listedApiNames as jest.Mock).mockReturnValue(['api-two']);
      Applications.setApis.mockResolvedValue({ added: [], removed: [], failed: [] });

      await controller().saveEditedApis(forId({ body: { apis: ['api-one'] } }), mockResponse(), jest.fn());
      expect(Applications.setApis).toHaveBeenCalledWith(OWNER, APPLICATION, ['api-one'], CATALOGUE);

      Applications.getApplication.mockResolvedValue({ ...APPLICATION, apis: [] });
      Applications.setApis.mockClear();
      const refused = mockResponse();
      await controller().saveEditedApis(forId({ body: { apis: ['api-one'] } }), refused, jest.fn());
      expect(refused.statusCode).toBe(400);
      expect(Applications.setApis).not.toHaveBeenCalled();
    });

    test('saving_no_apis_should_be_refused', async () => {
      const res = mockResponse();

      await controller().saveEditedApis(forId(), res, jest.fn());

      expect(res.statusCode).toBe(400);
      expect(Applications.setApis).not.toHaveBeenCalled();
    });

    test.each([
      [{ added: ['api-two'], removed: ['api-one'], failed: [] }, true, 'APIs updated: 1 added, 1 removed.'],
      [{ added: [], removed: [], failed: [] }, true, 'No changes were made to the APIs.'],
      [{ added: [], removed: [], failed: ['API two'] }, false, 'Some APIs could not be changed: API two.'],
    ])('saving_apis_should_say_what_happened_%#', async (changes, success, text) => {
      Applications.setApis.mockResolvedValue(changes);
      const res = mockResponse();
      const req = forId({ body: { apis: ['api-two'] } });

      await controller().saveEditedApis(req, res, jest.fn());

      expect(Applications.setApis).toHaveBeenCalledWith(OWNER, APPLICATION, ['api-two'], CATALOGUE);
      expect(req.session.notice?.success).toBe(success);
      expect(req.session.notice?.text).toContain(text);
      expect(res.redirected).toBe('/account/applications/client-1');
    });

    test('an_api_should_show_its_key_read_from_apim', async () => {
      Applications.subscriptionKey.mockResolvedValue('c5212ea6');
      const res = mockResponse();

      await controller().api(forId({ params: { id: 'client-1', api: 'api-one' } }), res, jest.fn());

      expect(res.view).toBe('applications/api');
      expect(res.data).toMatchObject({ subscriptionKey: 'c5212ea6', subscription: APPLICATION.apis[0] });
    });

    test('an_api_whose_key_cannot_be_read_should_still_show_the_page', async () => {
      Applications.subscriptionKey.mockRejectedValue(new BackendError('down'));
      const res = mockResponse();

      await controller().api(forId({ params: { id: 'client-1', api: 'api-one' } }), res, jest.fn());

      expect(res.view).toBe('applications/api');
      expect(res.data?.subscriptionKey).toBeUndefined();
    });

    test('an_api_the_application_is_not_subscribed_to_should_be_not_found', async () => {
      const next = jest.fn();

      await controller().api(forId({ params: { id: 'client-1', api: 'api-two' } }), mockResponse(), next);

      expect(next).toHaveBeenCalled();
    });

    test('deleting_should_need_the_confirmation', async () => {
      const res = mockResponse();

      await controller().remove(forId(), res, jest.fn());

      expect(res.redirected).toBe('/account/applications/client-1');
      expect(Applications.deleteApplication).not.toHaveBeenCalled();
    });

    test('a_confirmed_delete_should_remove_it_and_say_so', async () => {
      const res = mockResponse();
      const req = forId({ body: { confirm: 'yes' } });

      await controller().remove(req, res, jest.fn());

      expect(Applications.deleteApplication).toHaveBeenCalledWith(OWNER, APPLICATION);
      expect(req.session.notice?.text).toContain('Case Viewer has been deleted');
      expect(res.redirected).toBe('/account/applications');
    });

    test('a_delete_the_backend_cannot_complete_should_say_so', async () => {
      Applications.deleteApplication.mockRejectedValue(new BackendError('down', 502));
      const res = mockResponse();

      await controller().remove(forId({ body: { confirm: 'yes' } }), res, jest.fn());

      expect(res.statusCode).toBe(503);
    });

    test('every_action_on_an_application_that_is_not_the_callers_should_be_not_found', async () => {
      Applications.getApplication.mockResolvedValue(undefined);
      const actions = ['detail', 'access', 'editApis', 'saveEditedApis', 'api', 'confirmDelete', 'remove'] as const;

      for (const action of actions) {
        const next = jest.fn();
        await controller()[action](forId(), mockResponse(), next);
        expect(next).toHaveBeenCalled();
      }
      expect(Applications.deleteApplication).not.toHaveBeenCalled();
      expect(Applications.grantAccess).not.toHaveBeenCalled();
    });
  });
});
