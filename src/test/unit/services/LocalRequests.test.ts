import { MemoryStore, useDataStore } from '../../../main/modules/store';
import { addLocalRequest, getLocalRequest, statusText } from '../../../main/services/LocalRequests';

describe('LocalRequests', () => {
  beforeEach(() => useDataStore(new MemoryStore()));

  test('a_request_should_get_a_reference_prefixed_by_its_type', async () => {
    expect((await addLocalRequest('a@example.com', 'PUBLISH', [])).reference).toMatch(/^PUB-[0-9A-F]{8}$/);
    expect((await addLocalRequest('a@example.com', 'NEW_API', [])).reference).toMatch(/^NEW-/);
    expect((await addLocalRequest('a@example.com', 'PRODUCTION', [])).reference).toMatch(/^PCR-/);
  });

  test('a_request_should_be_found_for_its_owner_in_any_letter_case_and_not_for_anyone_else', async () => {
    const request = await addLocalRequest('A@example.com', 'PRODUCTION', [{ key: 'k', value: 'v' }]);

    expect(await getLocalRequest('a@example.com', request.reference)).toMatchObject({ status: 'SUBMITTED' });
    expect(await getLocalRequest('b@example.com', request.reference)).toBeUndefined();
  });

  test.each([
    ['SUBMITTED', 'Submitted'],
    ['IN_REVIEW', 'In review'],
    ['MORE_INFORMATION_NEEDED', 'More information needed'],
    ['APPROVED', 'Approved'],
    ['DECLINED', 'Declined'],
    ['SOMETHING_NEW', 'SOMETHING_NEW'],
  ])('the_status_%s_should_read_as_%s', (status, text) => {
    expect(statusText(status)).toBe(text);
  });
});
