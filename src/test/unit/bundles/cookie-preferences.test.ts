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

  test('initializes the cookie manager with preferences and manifest', () => {
    const manager = setupModule();

    expect(manager.init).toHaveBeenCalledWith(
      expect.objectContaining({
        userPreferences: { cookieName: 'apim-cookie-preferences' },
        cookieManifest: expect.arrayContaining([
          expect.objectContaining({
            categoryName: 'essential',
            optional: false,
            cookies: expect.arrayContaining(['i18next', 'formCookie', 'connect.sid']),
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

  test('registers handlers for cookie manager events', () => {
    const manager = setupModule();

    const events = manager.on.mock.calls.map(([event]) => event);
    expect(events).toEqual(
      expect.arrayContaining(['PreferenceFormSubmitted', 'UserPreferencesLoaded', 'UserPreferencesSaved'])
    );
  });

  test('PreferenceFormSubmitted shows the confirmation and scrolls to top', () => {
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

  test('UserPreferencesLoaded pushes preferences into the data layer', () => {
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

  test('UserPreferencesSaved enables Dynatrace when apm is on', () => {
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

  test('UserPreferencesSaved disables Dynatrace when apm is off', () => {
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
