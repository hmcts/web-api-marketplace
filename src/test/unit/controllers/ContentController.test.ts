import ContentController, { CONTENT_PAGES } from '../../../main/controllers/ContentController';
import { anonymous } from '../helpers/consumer';
import { mockResponse } from '../mocks/mockResponse';

describe('ContentController', () => {
  test.each(Object.entries(CONTENT_PAGES))('%s_should_render_%s', (path, view) => {
    const req = anonymous();
    (req as { path: string }).path = path;
    const res = mockResponse();

    new ContentController().get(req, res);

    expect(res.view).toBe(view);
  });

  test('a_trailing_slash_should_reach_the_same_page', () => {
    const req = anonymous();
    (req as { path: string }).path = '/get-started/';
    const res = mockResponse();

    new ContentController().get(req, res);

    expect(res.view).toBe('content/get-started/index');
  });
});
