const MESSAGE = 'Creating your application. This can take up to a minute';
const DOTS_MS = 500;

/** Says the create is running: Entra and APIM take several seconds, and the page is silent until they answer. */
export function reportCreateInProgress(
  form: HTMLFormElement,
  every: (run: () => void, ms: number) => unknown = setInterval
): void {
  const status = document.getElementById('create-status');
  const message = document.getElementById('create-status-message');
  const dots = document.getElementById('create-status-dots');
  if (!status || !message || !dots) {
    return;
  }

  form.addEventListener('submit', () => {
    message.textContent = MESSAGE;
    status.hidden = false;

    if (stillWanted()) {
      dots.textContent = '...';
      return;
    }
    let shown = 0;
    every(() => (dots.textContent = '.'.repeat((shown++ % 3) + 1)), DOTS_MS);
  });
}

/** Whether the reader has asked for as little movement as possible. */
function stillWanted(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const form = typeof document === 'undefined' ? null : document.getElementById('create-application-form');
if (form) {
  reportCreateInProgress(form as HTMLFormElement);
}
