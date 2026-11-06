import ApiCatalogueController from '../../../main/controllers/ApiCatalogueController';
import { CATALOGUE, anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

jest.mock('../../../main/services/ApiCatalogue', () => ({
  ...jest.requireActual('../../../main/services/ApiCatalogue'),
  getCatalogueApis: jest.fn(),
  getCatalogueApi: jest.fn(),
}));

const { getCatalogueApis, getCatalogueApi } = require('../../../main/services/ApiCatalogue');

const DETAIL = {
  ...CATALOGUE[0],
  catalogueName: 'api-one',
  docsUrl: 'https://hmcts.github.io/api-one/',
  repoUrl: 'https://github.com/hmcts/api-one',
};

describe('ApiCatalogueController', () => {
  beforeEach(() => {
    (getCatalogueApis as jest.Mock).mockResolvedValue(CATALOGUE);
    (getCatalogueApi as jest.Mock).mockReset();
    (getCatalogueApi as jest.Mock).mockResolvedValue(DETAIL);
  });

  test('browsing_should_list_every_api_the_backend_gives', async () => {
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous(), res);

    expect(res.view).toBe('api-catalogue/index');
    expect(res.data).toMatchObject({ query: '', unavailable: false });
    expect((res.data?.results as { shortCode: string }[]).map(api => api.shortCode)).toEqual(['one', 'two']);
  });

  test('browsing_should_group_apis_by_letter_and_link_only_letters_that_have_any', async () => {
    (getCatalogueApis as jest.Mock).mockResolvedValue([
      { shortCode: 'hearing', title: 'CP Crime Hearing API' },
      { shortCode: 'defendant', title: 'Defendant Details' },
      { shortCode: 'clp', title: 'Crime Court List Publisher' },
      { shortCode: 'x', title: '2026 API' },
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

  test.each([
    ['API TWO', ['two']],
    ['first', ['one']],
    ['team-one', ['one']],
    ['reference data', ['one']],
    ['one', ['one']],
    ['nothing matches', []],
  ])('searching_for_%s_should_find_%j', async (q, codes) => {
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous({ query: { q } }), res);

    expect((res.data?.results as { shortCode: string }[]).map(api => api.shortCode)).toEqual(codes);
  });

  test('an_empty_catalogue_should_say_it_is_unavailable', async () => {
    (getCatalogueApis as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();

    await new ApiCatalogueController().list(anonymous(), res);

    expect(res.data?.unavailable).toBe(true);
  });

  test('an_api_in_the_catalogue_should_get_its_page_with_the_links_the_backend_publishes', async () => {
    const res = mockResponse();
    const next = jest.fn();

    await new ApiCatalogueController().detail(anonymous({ params: { shortCode: 'one' } }), res, next);

    expect(getCatalogueApi).toHaveBeenCalledWith('one');
    expect(res.view).toBe('api-catalogue/detail');
    expect(res.data?.api).toEqual(DETAIL);
    expect(next).not.toHaveBeenCalled();
  });

  test('the_full_description_should_be_shown_as_paragraphs', async () => {
    (getCatalogueApi as jest.Mock).mockResolvedValue({
      ...DETAIL,
      description: 'First paragraph\nwrapped.\n\nSecond paragraph.',
    });
    const res = mockResponse();

    await new ApiCatalogueController().detail(anonymous({ params: { shortCode: 'one' } }), res, jest.fn());

    expect(res.data?.descriptionParagraphs).toEqual(['First paragraph wrapped.', 'Second paragraph.']);
  });

  test('an_api_with_no_description_should_fall_back_to_its_summary', async () => {
    const res = mockResponse();

    await new ApiCatalogueController().detail(anonymous({ params: { shortCode: 'one' } }), res, jest.fn());

    expect(res.data?.descriptionParagraphs).toEqual([CATALOGUE[0].summary]);
  });

  test('an_api_with_no_description_anywhere_should_show_none', async () => {
    (getCatalogueApi as jest.Mock).mockResolvedValue({ shortCode: 'one', title: 'API One' });
    const res = mockResponse();

    await new ApiCatalogueController().detail(anonymous({ params: { shortCode: 'one' } }), res, jest.fn());

    expect(res.data?.descriptionParagraphs).toEqual([]);
  });

  test('a_short_code_the_catalogue_does_not_list_should_be_handed_on', async () => {
    (getCatalogueApi as jest.Mock).mockResolvedValue(undefined);
    const res = mockResponse();
    const next = jest.fn();

    await new ApiCatalogueController().detail(anonymous({ params: { shortCode: 'not-listed' } }), res, next);

    expect(next).toHaveBeenCalled();
    expect(res.view).toBeUndefined();
  });
});
