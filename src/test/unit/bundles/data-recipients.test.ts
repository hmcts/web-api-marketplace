/**
 * @jest-environment jsdom
 */
import { showExplanationWhenNeeded } from '../../../main/bundles/data-recipients';

function page(): HTMLElement {
  document.body.innerHTML = `
    <form>
      <input type="checkbox" name="data-recipients" value="own-team" data-explanation-not-needed="true">
      <input type="checkbox" name="data-recipients" value="other-hmcts">
      <input type="checkbox" name="data-recipients" value="wider-moj">
      <div id="data-recipients-explanation-group"><textarea></textarea></div>
    </form>`;
  const group = document.getElementById('data-recipients-explanation-group') as HTMLElement;
  showExplanationWhenNeeded(group);
  return group;
}

const tick = (value: string, checked = true) => {
  const box = document.querySelector<HTMLInputElement>(`input[value="${value}"]`) as HTMLInputElement;
  box.checked = checked;
  box.dispatchEvent(new Event('change'));
};

describe('data-recipients bundle', () => {
  test('with_nothing_chosen_the_explanation_should_be_hidden', () => {
    expect(page().hidden).toBe(true);
  });

  test('choosing_only_my_own_team_should_leave_the_explanation_hidden', () => {
    const group = page();
    tick('own-team');
    expect(group.hidden).toBe(true);
  });

  test.each(['other-hmcts', 'wider-moj'])('choosing_%s_should_show_the_explanation', value => {
    const group = page();
    tick(value);
    expect(group.hidden).toBe(false);
  });

  test('choosing_my_own_team_together_with_another_option_should_still_show_the_explanation', () => {
    const group = page();
    tick('own-team');
    tick('wider-moj');
    expect(group.hidden).toBe(false);
  });

  test('clearing_the_last_other_option_should_hide_the_explanation_again', () => {
    const group = page();
    tick('other-hmcts');
    tick('wider-moj');
    tick('other-hmcts', false);
    expect(group.hidden).toBe(false);
    tick('wider-moj', false);
    expect(group.hidden).toBe(true);
  });

  test('the_explanation_should_already_be_shown_when_an_option_was_ticked_on_page_load', () => {
    document.body.innerHTML = `
      <input type="checkbox" name="data-recipients" value="other-hmcts" checked>
      <div id="data-recipients-explanation-group"></div>`;
    const group = document.getElementById('data-recipients-explanation-group') as HTMLElement;
    showExplanationWhenNeeded(group);
    expect(group.hidden).toBe(false);
  });
});
