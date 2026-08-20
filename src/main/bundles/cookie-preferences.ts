import cookieManager from '@hmcts/cookie-manager';

cookieManager.on('PreferenceFormSubmitted', () => {
  const message = document.querySelector('.cookie-preference-success') as HTMLElement;
  if (message) {
    message.style.display = 'block';
    message.focus?.();
  }
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
});

cookieManager.on('UserPreferencesLoaded', preferences => {
  const dataLayer = window.dataLayer || [];
  dataLayer.push({
    event: 'Cookie Preferences',
    cookiePreferences: preferences,
  });
});

cookieManager.on('UserPreferencesSaved', preferences => {
  const dataLayer = window.dataLayer || [];
  const dtrum = window.dtrum;

  dataLayer.push({
    event: 'Cookie Preferences',
    cookiePreferences: preferences,
  });

  if (dtrum !== undefined) {
    if (preferences.apm === 'on') {
      dtrum.enable();
      dtrum.enableSessionReplay();
    } else {
      dtrum.disableSessionReplay();
      dtrum.disable();
    }
  }
});

const config = {
  userPreferences: {
    cookieName: 'apim-cookie-preferences',
  },
  cookieManifest: [
    {
      categoryName: 'essential',
      optional: false,
      cookies: ['i18next', 'formCookie', 'connect.sid'],
    },
    {
      categoryName: 'analytics',
      cookies: ['_ga', '_gid', '_gat_UA-', '_gat'],
    },
    {
      categoryName: 'apm',
      cookies: ['dtCookie', 'dtLatC', 'dtPC', 'dtSa', 'rxVisitor', 'rxvt'],
    },
  ],
};

cookieManager.init(config);
