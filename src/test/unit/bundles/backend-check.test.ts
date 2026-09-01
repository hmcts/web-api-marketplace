/**
 * @jest-environment jsdom
 */
import { initBackendCheck } from '../../../main/bundles/backend-check';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setupPage(): { button: HTMLElement; result: HTMLElement } {
  document.body.innerHTML = `
    <button id="backend-check-button">Check backend connection</button>
    <div id="backend-check-result"></div>
  `;
  initBackendCheck();

  return {
    button: document.getElementById('backend-check-button') as HTMLElement,
    result: document.getElementById('backend-check-result') as HTMLElement,
  };
}

describe('backend check bundle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('a_successful_check_should_show_connected_with_the_url_and_latency', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true, url: 'http://backend/', latencyMs: 12, detail: 'API Marketplace' }),
    }) as unknown as typeof fetch;

    const { button, result } = setupPage();
    button.click();
    await flush();

    expect(result.innerHTML).toContain('Connected');
    expect(result.innerHTML).toContain('govuk-tag--green');
    expect(result.innerHTML).toContain('http://backend/');
    expect(result.innerHTML).toContain('12ms');
  });

  test('a_failed_check_should_show_not_connected_with_the_detail', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: false, url: 'http://backend/', detail: 'ECONNREFUSED' }),
    }) as unknown as typeof fetch;

    const { button, result } = setupPage();
    button.click();
    await flush();

    expect(result.innerHTML).toContain('Not connected');
    expect(result.innerHTML).toContain('govuk-tag--red');
    expect(result.innerHTML).toContain('ECONNREFUSED');
  });

  test('a_rejected_fetch_should_show_not_connected_with_the_error_message', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const { button, result } = setupPage();
    button.click();
    await flush();

    expect(result.innerHTML).toContain('Not connected');
    expect(result.innerHTML).toContain('network down');
  });

  test('html_in_the_backend_response_should_be_escaped_not_rendered', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: false, url: 'http://backend/', detail: '<img src=x onerror=alert(1)>' }),
    }) as unknown as typeof fetch;

    const { button, result } = setupPage();
    button.click();
    await flush();

    expect(result.querySelector('img')).toBeNull();
    expect(result.innerHTML).toContain('&lt;img');
  });

  test('the_button_should_be_disabled_while_the_check_is_in_flight', async () => {
    let release: (value: unknown) => void = () => undefined;
    global.fetch = jest.fn().mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      })
    ) as unknown as typeof fetch;

    const { button } = setupPage();
    button.click();
    await flush();

    expect(button.hasAttribute('disabled')).toBe(true);

    release({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true, url: 'http://backend/', latencyMs: 1, detail: 'ok' }),
    });
    await flush();

    expect(button.hasAttribute('disabled')).toBe(false);
  });

  test('a_page_without_the_button_should_not_throw', () => {
    document.body.innerHTML = '<div></div>';

    expect(() => initBackendCheck()).not.toThrow();
  });

  test('an_html_response_from_a_proxy_should_report_the_http_status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'text/html' },
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    }) as unknown as typeof fetch;

    const { button, result } = setupPage();
    button.click();
    await flush();

    expect(result.innerHTML).toContain('Not connected');
    expect(result.innerHTML).toContain('HTTP 403');
    expect(result.innerHTML).not.toContain('Unexpected token');
  });

  test('a_502_from_our_own_route_should_still_be_parsed_as_json', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'application/json; charset=utf-8' },
      json: async () => ({ ok: false, url: 'http://backend/', detail: 'ECONNREFUSED' }),
    }) as unknown as typeof fetch;

    const { button, result } = setupPage();
    button.click();
    await flush();

    expect(result.innerHTML).toContain('ECONNREFUSED');
  });
});
