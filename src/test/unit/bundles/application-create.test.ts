/**
 * @jest-environment jsdom
 */
import { reportCreateInProgress } from '../../../main/bundles/application-create';

function page(withStatus = true): HTMLFormElement {
  document.body.innerHTML = `
    <form id="create-application-form">
      <button id="create-application" data-prevent-double-click="true">Create application</button>
      ${
        withStatus
          ? `<p class="govuk-body" id="create-status" role="status" aria-live="polite" hidden><span
              id="create-status-message"></span><span id="create-status-dots" aria-hidden="true"></span></p>`
          : ''
      }
    </form>`;
  return document.getElementById('create-application-form') as HTMLFormElement;
}

const status = () => document.getElementById('create-status');
const message = () => document.getElementById('create-status-message')?.textContent;
const dots = () => document.getElementById('create-status-dots')?.textContent;

const reducedMotion = (reduce: boolean) =>
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockReturnValue({ matches: reduce }),
  });

describe('application-create bundle', () => {
  beforeEach(() => reducedMotion(false));

  test('before_submitting_the_page_should_say_nothing', () => {
    reportCreateInProgress(page());

    expect(status()?.hidden).toBe(true);
    expect(message()).toBe('');
  });

  test('submitting_should_say_the_application_is_being_created_and_how_long_it_may_take', () => {
    const form = page();
    reportCreateInProgress(form, () => undefined);

    form.dispatchEvent(new Event('submit'));

    expect(status()?.hidden).toBe(false);
    expect(message()).toBe('Creating your application. This can take up to a minute');
  });

  test('the_dots_should_cycle_so_a_slow_create_does_not_look_frozen', () => {
    const form = page();
    const ticks: (() => void)[] = [];
    reportCreateInProgress(form, run => ticks.push(run));

    form.dispatchEvent(new Event('submit'));
    const shown = [dots()];
    for (let i = 0; i < 4; i++) {
      ticks[0]();
      shown.push(dots());
    }

    expect(shown).toEqual(['', '.', '..', '...', '.']);
  });

  test('a_reader_who_asked_for_less_movement_should_get_the_dots_without_the_movement', () => {
    reducedMotion(true);
    const form = page();
    const ticks: (() => void)[] = [];
    reportCreateInProgress(form, run => ticks.push(run));

    form.dispatchEvent(new Event('submit'));

    expect(dots()).toBe('...');
    expect(ticks).toHaveLength(0);
  });

  test('the_sentence_that_is_read_out_should_not_carry_the_moving_dots', () => {
    const form = page();
    reportCreateInProgress(form, () => undefined);

    form.dispatchEvent(new Event('submit'));

    expect(message()).not.toContain('.'.repeat(3));
    expect(document.getElementById('create-status-dots')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('a_page_without_the_status_paragraph_should_be_left_alone_rather_than_throwing', () => {
    const form = page(false);

    expect(() => reportCreateInProgress(form)).not.toThrow();
    expect(() => form.dispatchEvent(new Event('submit'))).not.toThrow();
  });
});
