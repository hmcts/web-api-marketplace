import axios from 'axios';

import { clearCatalogueCache, getCatalogueApis } from '../../../main/services/ApiCatalogue';

jest.mock('axios');

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const feed = {
  apis: [
    { name: 'api-cp-crime-court-list-publisher', title: 'Crime Court List Publisher' },
    { name: 'api-cp-ai-rag', title: 'RAG Service API' },
  ],
};

describe('ApiCatalogue', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    clearCatalogueCache();
  });

  test('a_successful_fetch_should_return_the_apis_sorted_by_title', async () => {
    mockedGet.mockResolvedValue({ data: feed });

    const apis = await getCatalogueApis();

    expect(apis.map(api => api.title)).toEqual(['Crime Court List Publisher', 'RAG Service API']);
  });

  test('an_api_without_a_title_should_fall_back_to_its_name', async () => {
    mockedGet.mockResolvedValue({ data: { apis: [{ name: 'api-cp-ai-rag' }] } });

    expect((await getCatalogueApis())[0].title).toBe('api-cp-ai-rag');
  });

  test('an_entry_without_a_name_should_be_dropped', async () => {
    mockedGet.mockResolvedValue({ data: { apis: [{ title: 'Nameless' }, { name: 'api-cp-ai-rag' }] } });

    expect(await getCatalogueApis()).toHaveLength(1);
  });

  test('a_second_call_should_be_served_from_the_cache_without_fetching_again', async () => {
    mockedGet.mockResolvedValue({ data: feed });

    await getCatalogueApis();
    await getCatalogueApis();

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  test('a_failed_fetch_should_return_an_empty_list_rather_than_throwing', async () => {
    mockedGet.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    expect(await getCatalogueApis()).toEqual([]);
  });

  test('a_failed_refresh_should_fall_back_to_the_previously_cached_list', async () => {
    mockedGet.mockResolvedValue({ data: feed });
    await getCatalogueApis();

    // Age the clock past the cache TTL so the next call tries the feed again.
    const later = Date.now() + 60 * 60 * 1000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(later);
    mockedGet.mockRejectedValue(new Error('timeout'));

    expect(await getCatalogueApis()).toHaveLength(2);
    expect(mockedGet).toHaveBeenCalledTimes(2);

    clock.mockRestore();
  });
});
