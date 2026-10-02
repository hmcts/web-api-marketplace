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
    expect(res.data).toMatchObject({ query: '', results: CATALOGUE, unavailable: false });
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
      api: CATALOGUE[0],
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
