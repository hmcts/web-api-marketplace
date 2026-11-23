import axios from 'axios';

import {
  clearCatalogueCache,
  getCatalogueApi,
  getCatalogueApis,
  includingSubscribed,
  paragraphsOf,
} from '../../../main/services/ApiCatalogue';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const CATALOGUE = [
  { shortCode: 'clp', title: 'Crime Court List Publisher', platform: 'Common Platform', subscribable: true },
  { shortCode: 'rag', title: 'RAG Service API', domain: 'AI', subscribable: false },
];

const DETAIL = {
  ...CATALOGUE[0],
  catalogueName: 'api-cp-crime-court-list-publisher',
  description: 'Publishes the court list.',
  docsUrl: 'https://hmcts.github.io/api-cp-crime-court-list-publisher/',
  repoUrl: 'https://github.com/hmcts/api-cp-crime-court-list-publisher',
  resourceAppId: 'aaaaaaaa-1111-2222-3333-444444444444',
  role: 'app.read',
};

/** The error shape axios throws, which getCatalogueApi reads the status from. */
const answered = (status: number) => ({ response: { status } });

describe('ApiCatalogue', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    clearCatalogueCache();
  });

  test('the_catalogue_should_be_read_from_the_backend_sorted_by_title', async () => {
    mockedGet.mockResolvedValue({ data: [CATALOGUE[1], CATALOGUE[0]] });

    expect((await getCatalogueApis()).map(api => api.title)).toEqual(['Crime Court List Publisher', 'RAG Service API']);
    expect(mockedGet.mock.calls[0][0]).toMatch(/\/catalogue$/);
  });

  test('a_second_call_should_be_served_from_the_cache_without_fetching_again', async () => {
    mockedGet.mockResolvedValue({ data: CATALOGUE });

    await getCatalogueApis();
    await getCatalogueApis();

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  test('a_failed_fetch_should_return_an_empty_list_rather_than_throwing', async () => {
    mockedGet.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    expect(await getCatalogueApis()).toEqual([]);
  });

  test('a_failed_refresh_should_fall_back_to_the_previously_cached_list', async () => {
    mockedGet.mockResolvedValue({ data: CATALOGUE });
    await getCatalogueApis();

    // Age the clock past the cache TTL so the next call asks the backend again.
    const later = Date.now() + 60 * 60 * 1000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(later);
    mockedGet.mockRejectedValue(new Error('timeout'));

    expect(await getCatalogueApis()).toHaveLength(2);
    expect(mockedGet).toHaveBeenCalledTimes(2);

    clock.mockRestore();
  });

  describe('one api', () => {
    test('a_short_code_should_be_read_by_its_own_path', async () => {
      mockedGet.mockResolvedValue({ data: DETAIL });

      expect(await getCatalogueApi('clp')).toEqual(DETAIL);
      expect(mockedGet.mock.calls[0][0]).toMatch(/\/catalogue\/clp$/);
    });

    test('a_short_code_with_a_slash_should_be_escaped_rather_than_pasted_into_the_path', async () => {
      mockedGet.mockResolvedValue({ data: DETAIL });

      await getCatalogueApi('../products');

      expect(mockedGet.mock.calls[0][0]).toMatch(/\/catalogue\/\.\.%2Fproducts$/);
    });

    test('a_short_code_the_catalogue_does_not_list_should_come_back_as_nothing', async () => {
      mockedGet.mockRejectedValue(answered(404));

      expect(await getCatalogueApi('nope')).toBeUndefined();
    });

    test('a_second_read_of_a_missing_short_code_should_not_ask_again', async () => {
      mockedGet.mockRejectedValue(answered(404));

      await getCatalogueApi('nope');
      await getCatalogueApi('nope');

      expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    test('an_unreachable_backend_should_be_raised_rather_than_read_as_not_listed', async () => {
      mockedGet.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(getCatalogueApi('clp')).rejects.toThrow('Could not read');
    });
  });

  describe('includingSubscribed', () => {
    test('a_subscription_the_catalogue_still_lists_should_not_be_added_twice', () => {
      const kept = includingSubscribed(CATALOGUE, [{ shortCode: 'clp', apiTitle: 'Crime Court List Publisher' }]);

      expect(kept).toEqual(CATALOGUE);
    });

    test('a_subscription_the_catalogue_no_longer_lists_should_stay_so_it_is_not_dropped_unseen', () => {
      const kept = includingSubscribed(CATALOGUE, [{ shortCode: 'gone', apiTitle: 'Another API' }]);

      expect(kept.map(api => api.title)).toEqual(['Another API', 'Crime Court List Publisher', 'RAG Service API']);
    });

    test('no_subscriptions_should_leave_the_catalogue_as_it_is', () => {
      expect(includingSubscribed(CATALOGUE, [])).toEqual(CATALOGUE);
    });
  });

  describe('paragraphsOf', () => {
    test('blank_lines_should_separate_paragraphs_and_wrapping_should_not', () => {
      expect(paragraphsOf('One that\nwraps.\n\nTwo.\n  \nThree.')).toEqual(['One that wraps.', 'Two.', 'Three.']);
    });

    test('text_that_is_only_whitespace_should_give_no_paragraphs', () => {
      expect(paragraphsOf(' \n\n ')).toEqual([]);
    });
  });
});
