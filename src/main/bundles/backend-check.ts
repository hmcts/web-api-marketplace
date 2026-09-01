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
