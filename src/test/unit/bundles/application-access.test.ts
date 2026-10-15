/**
 * @jest-environment jsdom
 */
import { watchApplicationAccess } from '../../../main/bundles/application-access';

function page(attempts = 8, interval = 15): HTMLElement {
  document.body.innerHTML = `
    <div id="application-access" data-access-url="/account/applications/client-1/access" data-attempts="${attempts}" data-interval="${interval}">
      <div id="access-pending">These credentials will not work yet.</div>
      <p id="access-status"></p>
      <form id="check-access-form"></form>
    </div>`;
  return document.getElementById('application-access') as HTMLElement;
}

const status = () => document.getElementById('access-status')?.textContent;

describe('application-access bundle', () => {
  test('pending_answers_should_be_retried_at_the_interval_until_granted', async () => {
    const post = jest
      .fn()
      .mockResolvedValueOnce({ state: 'pending' })
      .mockResolvedValueOnce({ state: 'pending' })
      .mockResolvedValueOnce({ state: 'granted' });
    const pause = jest.fn().mockResolvedValue(undefined);

    await watchApplicationAccess(page(), post, pause);

    expect(post).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledWith('/account/applications/client-1/access');
    expect(pause).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(15000);
    expect(status()).toBe('Access is set up. These credentials are ready to use.');
    expect(document.getElementById('access-pending')).toBeNull();
    expect(document.getElementById('check-access-form')).toBeNull();
  });

  test('a_failure_should_stop_retrying_and_say_why', async () => {
    const post = jest.fn().mockResolvedValue({ state: 'failed', message: 'Graph refused.' });

    await watchApplicationAccess(page(), post, jest.fn());

    expect(post).toHaveBeenCalledTimes(1);
    expect(status()).toBe('Access could not be set up: Graph refused.');
    expect(document.getElementById('access-pending')).not.toBeNull();
  });

  test('giving_up_after_the_last_attempt_should_offer_the_check_again', async () => {
    const post = jest.fn().mockResolvedValue({ state: 'pending' });
    const pause = jest.fn().mockResolvedValue(undefined);

    await watchApplicationAccess(page(8), post, pause);

    expect(post).toHaveBeenCalledTimes(8);
    expect(pause).toHaveBeenCalledTimes(7);
    expect(status()).toBe('Access is taking longer than expected. Use "Check access" to try again.');
    expect(document.getElementById('check-access-form')).not.toBeNull();
  });

  test('a_request_that_cannot_be_sent_should_stop_with_a_message', async () => {
    const post = jest.fn().mockRejectedValue(new Error('offline'));

    await watchApplicationAccess(page(), post, jest.fn());

    expect(status()).toBe('Access could not be set up: The service could not be reached. Try again later.');
  });
});
