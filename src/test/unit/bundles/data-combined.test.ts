/**
 * @jest-environment jsdom
 */
import { showDescriptionWhenNeeded } from '../../../main/bundles/data-combined';

function page(checked = ''): HTMLElement {
  document.body.innerHTML = `
    <form>
      <input type="radio" name="data-combined" value="no" ${checked === 'no' ? 'checked' : ''}>
      <input type="radio" name="data-combined" value="yes" ${checked === 'yes' ? 'checked' : ''}>
      <input type="radio" name="data-combined" value="unsure" ${checked === 'unsure' ? 'checked' : ''}>
      <div id="data-combined-description-group"><textarea></textarea></div>
    </form>`;
  const group = document.getElementById('data-combined-description-group') as HTMLElement;
  showDescriptionWhenNeeded(group);
  return group;
}

const choose = (value: string) => {
  const radio = document.querySelector<HTMLInputElement>(`input[value="${value}"]`) as HTMLInputElement;
  radio.checked = true;
  radio.dispatchEvent(new Event('change'));
};

describe('data-combined bundle', () => {
  test('with_nothing_chosen_the_description_should_be_hidden', () => {
    expect(page().hidden).toBe(true);
  });

  test('choosing_no_should_leave_the_description_hidden', () => {
    const group = page();
    choose('no');
    expect(group.hidden).toBe(true);
  });

  test.each(['yes', 'unsure'])('choosing_%s_should_show_the_description', value => {
    const group = page();
    choose(value);
    expect(group.hidden).toBe(false);
  });

  test('changing_back_to_no_should_hide_the_description_again', () => {
    const group = page();
    choose('yes');
    choose('no');
    expect(group.hidden).toBe(true);
  });

  test('the_description_should_already_be_shown_when_yes_was_chosen_on_page_load', () => {
    expect(page('yes').hidden).toBe(false);
  });
});
