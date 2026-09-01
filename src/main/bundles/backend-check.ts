const BUTTON_ID = 'backend-check-button';
const RESULT_ID = 'backend-check-result';

function render(result: HTMLElement, tagClass: string, text: string, detail?: string): void {
  const detailHtml = detail ? `<p class="govuk-body-s govuk-!-margin-top-2">${detail}</p>` : '';
  result.innerHTML = `<strong class="govuk-tag ${tagClass}">${text}</strong>${detailHtml}`;
}

function escape(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

/**
 * The route answers 200 when connected and 502 when the backend is unreachable — both
 * carry JSON. Anything else came from in front of the service.
 */
function isJson(response: Response): boolean {
  return (
    (response.ok || response.status === 502) && !!response.headers.get('content-type')?.includes('application/json')
  );
}

export function initBackendCheck(): void {
  const button = document.getElementById(BUTTON_ID);
  const result = document.getElementById(RESULT_ID);

  if (!button || !result) {
    return;
  }

  button.addEventListener('click', async event => {
    event.preventDefault();
    button.setAttribute('disabled', 'disabled');
    render(result, 'govuk-tag--blue', 'Checking…');

    try {
      const response = await fetch('/backend-check', { headers: { Accept: 'application/json' } });

      // fetch resolves for any HTTP status, so a proxy error, shutter page or WAF block
      // arrives here as HTML. Report the status rather than letting json() fail on '<'.
      if (!isJson(response)) {
        render(
          result,
          'govuk-tag--red',
          'Not connected',
          `The check request returned HTTP ${response.status} without JSON — ` +
            'the response came from something in front of this service, not the service itself.'
        );
        return;
      }

      const body = await response.json();

      if (body.ok) {
        render(
          result,
          'govuk-tag--green',
          'Connected',
          `${escape(body.url)} responded in ${body.latencyMs}ms — ${escape(body.detail)}`
        );
      } else {
        render(result, 'govuk-tag--red', 'Not connected', `${escape(body.url)} — ${escape(body.detail)}`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      render(result, 'govuk-tag--red', 'Not connected', escape(detail));
    } finally {
      button.removeAttribute('disabled');
    }
  });
}
