import ApplicationsController from '../../../main/controllers/ApplicationsController';
import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { createApplication, getApplication } from '../../../main/services/Applications';
import { CATALOGUE, LOCAL_USER, anonymous, asUser } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
}));

jest.mock('../../../main/services/BackendApplications', () => ({
  ...jest.requireActual('../../../main/services/BackendApplications'),
  fetchApplications: jest.fn(),
  registerApplication: jest.fn(),
}));

const { getCatalogueApis } = require('../../../main/services/ApiCatalogue');
const {
  ApplicationsUnavailableError,
  fetchApplications,
  registerApplication,
} = require('../../../main/services/BackendApplications');

/** An account the backend knows, whose applications service-api-marketplace holds. */
const BACKEND_USER = { ...LOCAL_USER, id: 7, local: false, email: 'grace@example.com' };
const BACKEND_APPLICATION = {
  id: 12,
  name: 'Tracker',
  environment: 'sandbox',
  clientId: 'real-client-id',
  apiCredentials: [{ apiShortCode: 'api-one', publisherId: 'product-one', subscriptionKey: 'real-key' }],
};

const asBackendUser: typeof asUser = (parts = {}) =>
  asUser({ ...parts, session: { user: BACKEND_USER as never, ...parts.session } });

const DRAFT = { environment: 'sandbox', name: 'Tracker', description: '', apis: ['api-one'] };

const controller = () => new ApplicationsController();

async function existing() {
  return (await createApplication(LOCAL_USER, DRAFT, CATALOGUE)).application;
}

describe('ApplicationsController', () => {
  beforeEach(() => {
    useDataStore(new MemoryStore());
    (getCatalogueApis as jest.Mock).mockResolvedValue(CATALOGUE);
    (fetchApplications as jest.Mock).mockReset().mockResolvedValue([BACKEND_APPLICATION]);
    (registerApplication as jest.Mock).mockReset();
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
      ];

      for (const call of calls) {
        const res = mockResponse();
        await call(res);
        expect(res.redirected).toBe('/sign-in');
      }
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('listing', () => {
    test('applications_should_be_grouped_by_environment_with_a_one_off_notice', async () => {
      await existing();
      const res = mockResponse();
      const notice = { success: true, title: 'Success', text: 'Done' };

      await controller().list(asUser({ session: { notice } }), res);

      expect(res.view).toBe('applications/index');
      expect(res.data?.count).toBe(1);
      expect(res.data?.notice).toEqual(notice);
      expect((res.data?.groups as { name: string }[]).map(group => group.name)).toEqual(['Sandbox']);
    });
  });

  describe('creating', () => {
    test('the_intro_should_clear_any_earlier_answers', () => {
      const req = asUser({ session: { applicationDraft: DRAFT } });
      const res = mockResponse();

      controller().intro(req, res);

      expect(res.view).toBe('applications/new/index');
      expect(req.session.applicationDraft).toBeUndefined();
    });

    test('the_details_form_should_show_the_draft', () => {
      const res = mockResponse();

      controller().details(asUser({ session: { applicationDraft: { name: 'Tracker' } } }), res);

      expect(res.view).toBe('applications/new/details');
      expect(res.data?.draft).toEqual({ name: 'Tracker' });
    });

    test('details_with_errors_should_be_shown_again', async () => {
      const res = mockResponse();

      await controller().saveDetails(asUser({ body: {} }), res);

      expect(res.statusCode).toBe(400);
      expect(Object.keys(res.data?.errorFor as object)).toEqual(['name']);
    });

    test('valid_details_should_go_on_to_choosing_apis_in_the_sandbox', async () => {
      // An environment posted with the form is ignored: every application created here
      // is a sandbox one.
      const req = asUser({ body: { environment: 'aat', name: 'Tracker', description: 'Tracks cases' } });
      const res = mockResponse();

      await controller().saveDetails(req, res);

      expect(res.redirected).toBe('/account/applications/new/apis');
      expect(req.session.applicationDraft).toEqual({
        environment: 'sandbox',
        name: 'Tracker',
        description: 'Tracks cases',
      });
    });

    test('changing_details_once_apis_are_chosen_should_return_to_check_answers', async () => {
      const req = asUser({ body: { name: 'Tracker 2' }, session: { applicationDraft: DRAFT } });
      const res = mockResponse();

      await controller().saveDetails(req, res);

      expect(res.redirected).toBe('/account/applications/new/check-answers');
    });

    test('choosing_apis_without_details_should_go_back_to_details', async () => {
      for (const call of [
        (res: ReturnType<typeof mockResponse>) => controller().chooseApis(asUser(), res),
        (res: ReturnType<typeof mockResponse>) => controller().saveApis(asUser(), res),
        (res: ReturnType<typeof mockResponse>) => controller().checkAnswers(asUser(), res),
      ]) {
        const res = mockResponse();
        await call(res);
        expect(res.redirected).toBe('/account/applications/new/details');
      }
    });

    test('the_api_list_should_come_from_the_catalogue_with_choices_ticked', async () => {
      const res = mockResponse();

      await controller().chooseApis(asUser({ session: { applicationDraft: DRAFT } }), res);

      expect(res.view).toBe('applications/new/apis');
      expect(res.data?.apiItems).toEqual([
        { value: 'api-one', text: 'API one', hint: { text: 'The first API.' }, checked: true },
        { value: 'api-two', text: 'API two', hint: undefined, checked: false },
      ]);
      expect(res.data?.catalogueUnavailable).toBe(false);
    });

    test('no_apis_chosen_should_be_refused', async () => {
      const res = mockResponse();

      await controller().saveApis(asUser({ body: {}, session: { applicationDraft: { name: 'Tracker' } } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.data?.errorFor).toEqual({ apis: 'Select at least one API' });
    });

    test('chosen_apis_should_go_on_to_check_answers', async () => {
      const req = asUser({
        body: { apis: ['api-one', 'api-two'] },
        session: { applicationDraft: { name: 'Tracker' } },
      });
      const res = mockResponse();

      await controller().saveApis(req, res);

      expect(res.redirected).toBe('/account/applications/new/check-answers');
      expect(req.session.applicationDraft?.apis).toEqual(['api-one', 'api-two']);
    });

    test('check_answers_without_apis_should_go_back_to_choosing_them', async () => {
      const res = mockResponse();

      await controller().checkAnswers(asUser({ session: { applicationDraft: { name: 'Tracker' } } }), res);

      expect(res.redirected).toBe('/account/applications/new/apis');
    });

    test('check_answers_should_list_the_answers_with_api_titles', async () => {
      const res = mockResponse();

      await controller().checkAnswers(asUser({ session: { applicationDraft: DRAFT } }), res);

      expect(res.data?.rows).toEqual([
        { key: 'Application name', value: 'Tracker', href: '/account/applications/new/details' },
        { key: 'Description', value: 'None', href: '/account/applications/new/details' },
        { key: 'APIs', value: 'API one', href: '/account/applications/new/apis' },
      ]);
    });

    test('creating_should_show_the_credentials_once_and_clear_the_draft', async () => {
      const req = asUser({ session: { applicationDraft: DRAFT } });
      const res = mockResponse();

      await controller().create(req, res);

      expect(res.view).toBe('applications/new/confirmation');
      expect(res.data?.clientSecret).toMatch(/^.{3}8Q~/);
      expect(res.data?.simulated).toBe(true);
      expect(req.session.applicationDraft).toBeUndefined();
    });

    test('creating_with_no_draft_should_go_to_the_list', async () => {
      const res = mockResponse();

      await controller().create(asUser(), res);

      expect(res.redirected).toBe('/account/applications');
    });

    test('creating_a_name_taken_since_should_go_back_to_details', async () => {
      await existing();
      const res = mockResponse();

      await controller().create(asUser({ session: { applicationDraft: DRAFT } }), res);

      expect(res.redirected).toBe('/account/applications/new/details');
    });
  });

  describe('one application', () => {
    const params = (id: string, extra: Record<string, string> = {}) => ({ params: { id, ...extra } });

    test('an_unknown_id_should_be_handed_on_as_not_found', async () => {
      const next = jest.fn();
      const res = mockResponse();

      await controller().detail(asUser(params('not-mine')), res, next);

      expect(next).toHaveBeenCalled();
      expect(res.view).toBeUndefined();
    });

    test('the_detail_page_should_show_the_masked_secret', async () => {
      const application = await existing();
      const res = mockResponse();

      await controller().detail(asUser(params(application.id)), res, jest.fn());

      expect(res.view).toBe('applications/detail');
      expect(res.data).toMatchObject({ environment: 'Sandbox', maskedSecret: `${application.secretHint}****` });
    });

    test('the_apis_form_should_tick_the_current_apis', async () => {
      const application = await existing();
      const res = mockResponse();

      await controller().editApis(asUser(params(application.id)), res, jest.fn());

      expect(res.view).toBe('applications/apis');
      expect((res.data?.apiItems as { checked: boolean }[]).map(item => item.checked)).toEqual([true, false]);
    });

    test('saving_no_apis_should_be_refused', async () => {
      const application = await existing();
      const res = mockResponse();

      await controller().saveEditedApis(asUser({ ...params(application.id), body: {} }), res, jest.fn());

      expect(res.statusCode).toBe(400);
    });

    test('saving_changed_apis_should_say_what_changed', async () => {
      const application = await existing();
      const req = asUser({ ...params(application.id), body: { apis: 'api-two' } });
      const res = mockResponse();

      await controller().saveEditedApis(req, res, jest.fn());

      expect(res.redirected).toBe(`/account/applications/${application.id}`);
      expect(req.session.notice?.text).toContain('1 added, 1 removed');
    });

    test('saving_the_same_apis_should_say_nothing_changed', async () => {
      const application = await existing();
      const req = asUser({ ...params(application.id), body: { apis: 'api-one' } });

      await controller().saveEditedApis(req, mockResponse(), jest.fn());

      expect(req.session.notice?.text).toBe('No changes were made to the APIs.');
    });

    test('an_api_should_show_its_key_and_an_unsubscribed_one_should_be_not_found', async () => {
      const application = await existing();
      const res = mockResponse();
      const next = jest.fn();

      await controller().api(asUser(params(application.id, { api: 'api-one' })), res, next);
      expect(res.view).toBe('applications/api');
      expect(res.data?.subscription).toMatchObject({ apiName: 'api-one', publisherId: 'one' });

      await controller().api(asUser(params(application.id, { api: 'api-two' })), mockResponse(), next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('regenerating_should_confirm_first_then_show_the_new_secret_once', async () => {
      const application = await existing();
      const confirm = mockResponse();
      const done = mockResponse();

      await controller().confirmRegenerate(asUser(params(application.id)), confirm, jest.fn());
      await controller().regenerate(asUser(params(application.id)), done, jest.fn());

      expect(confirm.view).toBe('applications/client-secret');
      expect(done.view).toBe('applications/client-secret-new');
      expect((await getApplication(LOCAL_USER, application.id))?.secretHint).toBe(
        (done.data?.clientSecret as string).slice(0, 3)
      );
    });

    test('deleting_should_need_the_confirmation', async () => {
      const application = await existing();
      const confirm = mockResponse();
      const unconfirmed = mockResponse();

      await controller().confirmDelete(asUser(params(application.id)), confirm, jest.fn());
      await controller().remove(asUser({ ...params(application.id), body: {} }), unconfirmed, jest.fn());

      expect(confirm.view).toBe('applications/delete');
      expect(unconfirmed.redirected).toBe(`/account/applications/${application.id}`);
      expect(await getApplication(LOCAL_USER, application.id)).toBeDefined();
    });

    test('a_confirmed_delete_should_remove_it_and_say_so', async () => {
      const application = await existing();
      const req = asUser({ ...params(application.id), body: { confirm: 'yes' } });
      const res = mockResponse();

      await controller().remove(req, res, jest.fn());

      expect(res.redirected).toBe('/account/applications');
      expect(req.session.notice?.text).toContain('Tracker has been deleted');
      expect(await getApplication(LOCAL_USER, application.id)).toBeUndefined();
    });

    test('every_action_on_an_unknown_id_should_be_not_found', async () => {
      const next = jest.fn();
      const req = () =>
        asUser({ ...params('not-mine', { api: 'api-one' }), body: { confirm: 'yes', apis: 'api-one' } });

      await controller().editApis(req(), mockResponse(), next);
      await controller().saveEditedApis(req(), mockResponse(), next);
      await controller().api(req(), mockResponse(), next);
      await controller().confirmRegenerate(req(), mockResponse(), next);
      await controller().regenerate(req(), mockResponse(), next);
      await controller().confirmDelete(req(), mockResponse(), next);
      await controller().remove(req(), mockResponse(), next);

      expect(next).toHaveBeenCalledTimes(7);
    });
  });

  describe('an application held by the backend', () => {
    const NEW_DRAFT = { ...DRAFT, name: 'Another' };

    test('the_list_should_come_from_the_backend', async () => {
      const res = mockResponse();

      await controller().list(asBackendUser(), res);

      expect(fetchApplications).toHaveBeenCalledWith(7);
      expect(res.data?.count).toBe(1);
    });

    test('a_backend_that_cannot_list_should_say_so_rather_than_show_none', async () => {
      (fetchApplications as jest.Mock).mockRejectedValue(new ApplicationsUnavailableError('down'));
      const res = mockResponse();

      await controller().list(asBackendUser(), res);

      expect(res.statusCode).toBe(503);
      expect(res.data?.unavailable).toBe(true);
    });

    test('creating_should_show_the_real_credentials_once', async () => {
      (registerApplication as jest.Mock).mockResolvedValue({
        ...BACKEND_APPLICATION,
        id: 13,
        name: 'Another',
        clientSecret: 'abc8Q~real-secret',
      });
      const req = asBackendUser({ session: { applicationDraft: NEW_DRAFT } });
      const res = mockResponse();

      await controller().create(req, res);

      expect(res.view).toBe('applications/new/confirmation');
      expect(res.data?.clientSecret).toBe('abc8Q~real-secret');
      expect(res.data?.simulated).toBe(false);
      expect(req.session.applicationDraft).toBeUndefined();
    });

    test('a_failed_registration_should_keep_the_answers_and_say_so', async () => {
      (registerApplication as jest.Mock).mockRejectedValue(new ApplicationsUnavailableError('503'));
      const req = asBackendUser({ session: { applicationDraft: NEW_DRAFT } });
      const res = mockResponse();

      await controller().create(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.view).toBe('applications/new/check-answers');
      expect(res.data?.errors).toEqual([
        { name: 'create-application', text: 'Your application could not be created. Try again later.' },
      ]);
      expect(req.session.applicationDraft).toEqual(NEW_DRAFT);
    });

    test('the_detail_page_should_not_offer_what_the_backend_cannot_do', async () => {
      const res = mockResponse();

      await controller().detail(asBackendUser({ params: { id: '12' } }), res, jest.fn());

      expect(res.view).toBe('applications/detail');
      expect(res.data?.manageable).toBe(false);
      expect(res.data?.simulated).toBe(false);
      expect(res.data?.maskedSecret).toBe('Not shown');
    });

    test('an_api_should_show_its_real_subscription_key', async () => {
      const res = mockResponse();

      await controller().api(asBackendUser({ params: { id: '12', api: 'api-one' } }), res, jest.fn());

      expect((res.data?.subscription as { subscriptionKey: string }).subscriptionKey).toBe('real-key');
    });

    test('changing_rotating_and_deleting_should_be_not_found', async () => {
      const params = { id: '12' };
      const calls = [
        (next: jest.Mock) => controller().editApis(asBackendUser({ params }), mockResponse(), next),
        (next: jest.Mock) =>
          controller().saveEditedApis(asBackendUser({ params, body: { apis: ['api-two'] } }), mockResponse(), next),
        (next: jest.Mock) => controller().confirmRegenerate(asBackendUser({ params }), mockResponse(), next),
        (next: jest.Mock) => controller().regenerate(asBackendUser({ params }), mockResponse(), next),
        (next: jest.Mock) => controller().confirmDelete(asBackendUser({ params }), mockResponse(), next),
        (next: jest.Mock) =>
          controller().remove(asBackendUser({ params, body: { confirm: 'yes' } }), mockResponse(), next),
      ];

      for (const call of calls) {
        const next = jest.fn();
        await call(next);
        expect(next).toHaveBeenCalledTimes(1);
      }
    });
  });
});
