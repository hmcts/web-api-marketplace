/**
 * Shows "Briefly explain who will receive the data and why" once any option other than the
 * requester's own team is chosen, whether or not their own team is chosen too. Without JavaScript the box is always shown, and the server
 * asks for it whenever it is needed.
 */
export function showExplanationWhenNeeded(group: HTMLElement, form: ParentNode = document): void {
  const boxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="data-recipients"]'));

  const update = () => {
    group.hidden = !boxes.some(box => box.checked && box.dataset.explanationNotNeeded !== 'true');
  };

  boxes.forEach(box => box.addEventListener('change', update));
  update();
}

const group = typeof document === 'undefined' ? null : document.getElementById('data-recipients-explanation-group');
if (group) {
  showExplanationWhenNeeded(group);
}
