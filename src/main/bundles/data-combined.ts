/**
 * Shows "Briefly describe the other data and what the combined data will be used for?" once Yes or
 * Unsure is chosen. Without JavaScript the box is always shown, and the server asks for it
 * whenever it is needed.
 */
export function showDescriptionWhenNeeded(group: HTMLElement, form: ParentNode = document): void {
  const options = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="data-combined"]'));

  const update = () => {
    group.hidden = !options.some(option => option.checked && option.value !== 'no');
  };

  options.forEach(option => option.addEventListener('change', update));
  update();
}

const group = typeof document === 'undefined' ? null : document.getElementById('data-combined-description-group');
if (group) {
  showDescriptionWhenNeeded(group);
}
