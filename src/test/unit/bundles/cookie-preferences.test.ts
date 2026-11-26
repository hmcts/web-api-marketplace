jest.mock('@hmcts/cookie-manager', () => {
  const on = jest.fn();
  const init = jest.fn();
  return { __esModule: true, default: { on, init } };
});

type CookieManagerMock = {
  on: jest.Mock;
  init: jest.Mock;
};

type EventHandler = (preferences?: Record<string, string>) => void;

const setupModule = (): CookieManagerMock => {
  jest.resetModules();
  const cookieManagerModule = require('@hmcts/cookie-manager') as { default: CookieManagerMock };
  require('../../../main/bundles/cookie-preferences');
  return cookieManagerModule.default;
};

const getHandler = (manager: CookieManagerMock, eventName: string): EventHandler => {
  const handlerCall = manager.on.mock.calls.find(([name]) => name === eventName);
  if (!handlerCall) {
    throw new Error(`Missing handler for ${eventName}`);
  }
  return handlerCall[1] as EventHandler;
};

describe('cookie-preferences bundle', () => {
  afterEach(() => {
    delete (global as { document?: unknown }).document;
    delete (global as { window?: unknown }).window;
  });

  test('the_cookie_manager_should_start_with_the_amp_cookie_and_the_essential_analytics_and_apm_categories', () => {
    const manager = setupModule();

    expect(manager.init).toHaveBeenCalledWith(
      expect.objectContaining({
        userPreferences: { cookieName: 'amp-cookie-preferences' },
        cookieManifest: expect.arrayContaining([
          expect.objectContaining({
            categoryName: 'essential',
            optional: false,
            cookies: expect.arrayContaining(['formCookie', 'connect.sid']),
          }),
          expect.objectContaining({
            categoryName: 'analytics',
            cookies: expect.arrayContaining(['_ga', '_gid', '_gat_UA-', '_gat']),
          }),
          expect.objectContaining({
            categoryName: 'apm',
            cookies: expect.arrayContaining(['dtCookie', 'dtLatC', 'dtPC', 'dtSa', 'rxVisitor', 'rxvt']),
          }),
        ]),
      })
    );
  });

  test('the_bundle_should_listen_for_form_submitted_preferences_loaded_and_preferences_saved', () => {
    const manager = setupModule();

    const events = manager.on.mock.calls.map(([event]) => event);
    expect(events).toEqual(
      expect.arrayContaining(['PreferenceFormSubmitted', 'UserPreferencesLoaded', 'UserPreferencesSaved'])
    );
  });

  test('submitting_the_form_should_show_and_focus_the_confirmation_and_scroll_to_the_top', () => {
    const manager = setupModule();
    const handler = getHandler(manager, 'PreferenceFormSubmitted');
    const message = { style: { display: 'none' }, focus: jest.fn() };

    (global as { document: unknown }).document = {
      querySelector: jest.fn().mockReturnValue(message),
      body: { scrollTop: 100 },
      documentElement: { scrollTop: 200 },
    };

    handler();

    expect(message.style.display).toBe('block');
    expect(message.focus).toHaveBeenCalled();
    expect((global as { document: { body: { scrollTop: number } } }).document.body.scrollTop).toBe(0);
    expect(
      (global as { document: { documentElement: { scrollTop: number } } }).document.documentElement.scrollTop
    ).toBe(0);
  });

  test('loaded_preferences_should_be_pushed_to_the_data_layer', () => {
    const manager = setupModule();
    const handler = getHandler(manager, 'UserPreferencesLoaded');
    const dataLayer: { event: string; cookiePreferences: Record<string, string> }[] = [];

    (global as { window: unknown }).window = { dataLayer };

    handler({ analytics: 'on', apm: 'off' });

    expect(dataLayer).toEqual([
      {
        event: 'Cookie Preferences',
        cookiePreferences: { analytics: 'on', apm: 'off' },
      },
    ]);
  });

  test('saving_apm_on_should_record_the_choice_and_enable_dynatrace_and_session_replay', () => {
    const manager = setupModule();
    const handler = getHandler(manager, 'UserPreferencesSaved');
    const dataLayer: { event: string; cookiePreferences: Record<string, string> }[] = [];
    const dtrum = {
      enable: jest.fn(),
      enableSessionReplay: jest.fn(),
      disable: jest.fn(),
      disableSessionReplay: jest.fn(),
    };

    (global as { window: unknown }).window = { dataLayer, dtrum };

    handler({ apm: 'on' });

    expect(dataLayer).toEqual([
      {
        event: 'Cookie Preferences',
        cookiePreferences: { apm: 'on' },
      },
    ]);
    expect(dtrum.enable).toHaveBeenCalled();
    expect(dtrum.enableSessionReplay).toHaveBeenCalled();
    expect(dtrum.disable).not.toHaveBeenCalled();
    expect(dtrum.disableSessionReplay).not.toHaveBeenCalled();
  });

  test('saving_apm_off_should_record_the_choice_and_disable_dynatrace_and_session_replay', () => {
    const manager = setupModule();
    const handler = getHandler(manager, 'UserPreferencesSaved');
    const dataLayer: { event: string; cookiePreferences: Record<string, string> }[] = [];
    const dtrum = {
      enable: jest.fn(),
      enableSessionReplay: jest.fn(),
      disable: jest.fn(),
      disableSessionReplay: jest.fn(),
    };

    (global as { window: unknown }).window = { dataLayer, dtrum };

    handler({ apm: 'off' });

    expect(dataLayer).toEqual([
      {
        event: 'Cookie Preferences',
        cookiePreferences: { apm: 'off' },
      },
    ]);
    expect(dtrum.disable).toHaveBeenCalled();
    expect(dtrum.disableSessionReplay).toHaveBeenCalled();
    expect(dtrum.enable).not.toHaveBeenCalled();
    expect(dtrum.enableSessionReplay).not.toHaveBeenCalled();
  });
});
