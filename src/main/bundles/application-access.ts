type AccessState = { state: 'granted' } | { state: 'pending' } | { state: 'failed'; message?: string };

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Retries the role grant, which Entra refuses for a minute or two after the application is created. */
export async function watchApplicationAccess(
  container: HTMLElement,
  post: (url: string) => Promise<AccessState> = postForJson,
  pause: (ms: number) => Promise<void> = wait
): Promise<void> {
  const url = container.dataset.accessUrl ?? '';
  const attempts = Number(container.dataset.attempts) || 1;
  const intervalMs = (Number(container.dataset.interval) || 15) * 1000;
  const status = container.querySelector<HTMLElement>('#access-status');
  const show = (text: string) => {
    if (status) {
      status.textContent = text;
    }
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    show(`Setting up access… (attempt ${attempt} of ${attempts})`);
    let result: AccessState;
    try {
      result = await post(url);
    } catch {
      result = { state: 'failed', message: 'The service could not be reached. Try again later.' };
    }

    if (result.state === 'granted') {
      container.querySelector('#access-pending')?.remove();
      container.querySelector('#check-access-form')?.remove();
      show('Access is set up. These credentials are ready to use.');
      return;
    }
    if (result.state === 'failed') {
      show(`Access could not be set up: ${result.message ?? 'unknown error'}`);
      return;
    }
    if (attempt < attempts) {
      await pause(intervalMs);
    }
  }
  show('Access is taking longer than expected. Use "Check access" to try again.');
}

async function postForJson(url: string): Promise<AccessState> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  return (await response.json()) as AccessState;
}

const container = typeof document === 'undefined' ? null : document.getElementById('application-access');
if (container) {
  void watchApplicationAccess(container);
}
