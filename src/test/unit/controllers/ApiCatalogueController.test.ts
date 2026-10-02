import ApiCatalogueController from '../../../main/controllers/ApiCatalogueController';
import { CATALOGUE, anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
}));

const { getCatalogueApis } = require('../../../main/services/ApiCatalogue');

describe('ApiCatalogueController', () => {
  beforeEach(() => (getCatalogueApis as jest.Mock).mockResolvedValue(CATALOGUE));

  test('browsing_should_list_every_api', async () => {
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous(), res);

    expect(res.view).toBe('api-catalogue/index');
    expect(res.data).toMatchObject({ query: '', unavailable: false });
    expect((res.data?.results as { name: string }[]).map(api => api.name)).toEqual(['api-one', 'api-two']);
  });

  test('browsing_should_group_apis_by_letter_and_link_only_letters_that_have_any', async () => {
    (getCatalogueApis as jest.Mock).mockResolvedValue([
      { name: 'api-cp-crime-hearing', title: 'CP Crime Hearing API' },
      { name: 'api-cp-crime-defendant-details', title: 'Defendant Details' },
      { name: 'api-cp-crime-court-list-publisher', title: 'Crime Court List Publisher' },
      { name: 'api-x', title: '2026 API' },
    ]);
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous(), res);

    const groups = res.data?.groups as { letter: string; apis: { title: string }[] }[];
    expect(groups.map(group => group.letter)).toEqual(['C', 'D', '#']);
    expect(groups[0].apis.map(api => api.title)).toEqual(['CP Crime Hearing API', 'Crime Court List Publisher']);

    const letters = res.data?.letters as { letter: string; present: boolean }[];
    expect(letters).toHaveLength(26);
    expect(letters.filter(item => item.present).map(item => item.letter)).toEqual(['C', 'D']);
  });

  test('a_search_should_list_matches_without_letters', async () => {
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous({ query: { q: 'api' } }), res);

    expect(res.data?.groups).toEqual([]);
    expect((res.data?.letters as { present: boolean }[]).some(item => item.present)).toBe(false);
  });

  test('every_api_should_carry_its_platform_and_domain', async () => {
    (getCatalogueApis as jest.Mock).mockResolvedValue([{ name: 'api-cp-refdata-courthearing', title: 'Courts' }]);
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous(), res);

    expect((res.data?.results as object[])[0]).toMatchObject({ platform: 'Common Platform', domain: 'Reference data' });
  });

  test.each([
    ['API TWO', ['api-two']],
    ['first', ['api-one']],
    ['team-one', ['api-one']],
    ['nothing matches', []],
  ])('searching_for_%s_should_find_%j', async (q, names) => {
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous({ query: { q } }), res);

    expect((res.data?.results as { name: string }[]).map(api => api.name)).toEqual(names);
  });

  test('an_empty_feed_should_say_the_catalogue_is_unavailable', async () => {
    (getCatalogueApis as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous(), res);

    expect(res.data?.unavailable).toBe(true);
  });

  test('an_api_in_the_catalogue_should_get_its_page_with_links', async () => {
    const res = mockResponse();
    const next = jest.fn();

    await new ApiCatalogueController().detail(anonymous({ params: { name: 'api-one' } }), res, next);

    expect(res.view).toBe('api-catalogue/detail');
    expect(res.data).toMatchObject({
      api: { ...CATALOGUE[0], platform: 'Other', domain: 'Other' },
      docsUrl: 'https://hmcts.github.io/api-one/',
      repoUrl: 'https://github.com/hmcts/api-one',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('a_name_not_in_the_catalogue_should_be_handed_on', async () => {
    const res = mockResponse();
    const next = jest.fn();

    await new ApiCatalogueController().detail(anonymous({ params: { name: 'request-new-api' } }), res, next);

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });
});
